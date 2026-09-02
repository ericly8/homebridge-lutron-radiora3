const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const { ProcessorFinder, LeapClient, PairingClient, Processor } = require('../dist/leap');

const forge = require('node-forge');

class PluginUiServer extends HomebridgePluginUiServer {
    constructor() {
        // super() MUST be called first
        super();

        this.finder = new ProcessorFinder();
        this.finder.on('discovered', (processorNetInfo) => {
            this.pushEvent('discovered', processorNetInfo);
        });

        this.onRequest('/search', this.findProcessors.bind(this));
        this.onRequest('/connect', this.doConnect.bind(this));
        this.onRequest('/associate', this.doAssociate.bind(this));
        this.onRequest('/browse', this.doBrowse.bind(this));

        // this MUST be called when you are ready to accept requests
        this.ready();
    }

    async findProcessors() {
        this.finder.beginSearching();
    }

    async doConnect({ secrets, processorID, ipAddress }) {
        // This connection only exists to verify the stored secrets still work; the
        // running plugin holds the real persistent connection. Must be closed here or
        // it leaks a live connection to the processor every time this fires (e.g. on
        // every mDNS re-announcement while the settings screen is open), eventually
        // exhausting the processor's connection slots and hanging later requests
        // (like /browse) that need a fresh connection of their own.
        console.log('Got request to connect', processorID, 'at', ipAddress, ' with secrets', JSON.stringify(secrets));
        const client = new LeapClient(ipAddress, 8081 /*TODO magic number*/, secrets.ca, secrets.key, secrets.cert);
        try {
            await client.connect();
            console.log('client connected to', processorID, ipAddress);
            // TODO actually do a ping here, maybe return LEAP version?
        } catch (e) {
            console.log('failed to connect to', processorID, e);
            this.pushEvent('failed', { processorID: processorID, reason: e.message });
            throw e;
        } finally {
            client.close();
        }
        this.pushEvent('connected', processorID);
    }

    async doBrowse({ secrets, processorID, ipAddress }) {
        // Opens its own short-lived connection to the processor (separate from the
        // running plugin's connection) just to list what's actually configured on it,
        // so the settings UI can offer real names to pick from instead of a blind
        // free-text field.
        console.log('Got request to browse', processorID, 'at', ipAddress);
        const client = new LeapClient(ipAddress, 8081 /*TODO magic number*/, secrets.ca, secrets.key, secrets.cert);
        const processor = new Processor(processorID, client);

        try {
            await client.connect();

            const zones = [];
            const areas = await processor.getAreas();
            for (const area of areas) {
                if (!area.IsLeaf) {
                    continue;
                }
                for (const zoneHref of area.AssociatedZones || []) {
                    try {
                        const zone = await processor.getZoneDefinition(zoneHref);
                        zones.push({ name: zone.Name, area: area.Name, controlType: zone.ControlType });
                    } catch (e) {
                        console.log('failed to get zone', zoneHref.href, e.message);
                    }
                }
            }

            let virtualButtons = [];
            try {
                virtualButtons = (await processor.getVirtualButtons()).map((vb) => ({ name: vb.Name }));
            } catch (e) {
                console.log('failed to get virtual buttons', e.message);
            }

            return { zones, virtualButtons };
        } catch (e) {
            console.log('browse failed', processorID, ipAddress, e);
            throw new RequestError('Failed to browse processor', { message: e.message });
        } finally {
            processor.close();
        }
    }

    async doAssociate({ processorID, ipAddress }) {
        /***
         * This is kind of a long, ugly one. Here's what this does:
         * - Creates a new PairingClient w/ some default SSL credentials
         * - Waits for a special kind of message to come down the wire that indicates
         *   that the button has been pressed.
         * - Generate a new RSA keypair
         * - Create a certification signing request (PKCS#10)
         * - Submit it to the processor and wait for a special kind of response
         *   that includes the signed certificate
         * - Return the newly-generated privkey, cert, and CA to the UI
         ***/

        // Create a new pairing client w/ some default SSL credentials
        console.log('Got request to associate with', processorID, 'at', ipAddress);
        const client = new PairingClient(ipAddress, 8083 /*TODO magic number*/);
        try {
            await client.connect();
            console.log('association phase connected', processorID, ipAddress);
        } catch (e) {
            console.log('failed to associate', processorID, ipAddress, e);
            throw new Error('Initial associate failed!');
        }

        // Wait for a special kind of message to come down the wire that
        // indicates that the button has been pressed.
        try {
            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('timed out')), 30000);
                client.once('message', (response) => {
                    console.log('got message', response);
                    if (response.Body.Status.Permissions.includes('PhysicalAccess')) {
                        console.log('Physical access confirmed');
                        clearTimeout(t);
                        resolve();
                    } else {
                        console.log('unexpected pairing result', response);
                        reject(response);
                    }
                });
            });
        } catch (e) {
            console.log('waiting for button push failed', e);
            throw e;
        }

        // Generate a new RSA keypair
        const keys = await new Promise((resolve, reject) => {
            forge.pki.rsa.generateKeyPair({ bits: 2048 }, (err, keyPair) => {
                if (err !== undefined) {
                    resolve(keyPair);
                } else {
                    reject(err);
                }
            });
        });

        // Create a certification signing request (PKCS#10)
        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;
        csr.setSubject([
            {
                name: 'commonName',
                value: 'homebridge-lutron-radiora3',
            },
        ]);
        csr.sign(keys.privateKey);
        const csrText = forge.pki.certificationRequestToPem(csr);

        // Submit it to the processor and wait for a special kind of response that
        // includes the signed certificate
        let certResult;
        try {
            certResult = await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('CSR response timed out')), 5000);
                client.once('message', (response) => {
                    console.log('got cert request result', JSON.stringify(response));
                    resolve(response);
                });

                client.requestPair(csrText);
            });

            if (certResult.Header.StatusCode !== '200 OK') {
                throw new Error('bad CSR response: ' + JSON.stringify(certResult));
            }
        } catch (e) {
            console.log('CSR failed', e);
            throw e;
        }

        // Return the newly-generated privkey, cert, and CA to the UI
        this.pushEvent('associated', {
            processorID: processorID,
            ipAddress: ipAddress,
            secrets: {
                processorID: processorID,
                ca: certResult.Body.SigningResult.RootCertificate,
                cert: certResult.Body.SigningResult.Certificate,
                key: forge.pki.privateKeyToPem(keys.privateKey),
            },
        });
    }
}

(() => {
    return new PluginUiServer();
})();
