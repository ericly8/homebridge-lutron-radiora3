import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { DeviceWireResult, DeviceWireResultType, LutronRadioRA3Platform } from './platform';
import { Processor, ButtonDefinition, Response, OneButtonStatusEvent } from './leap';

// Home app switches are stateful, but a keypad button is considered momentary, so
// this flips itself back off shortly after being pressed to look/behave like a button.
const RESET_DELAY_MS = 1000;

export class KeypadButton {
    private service?: Service;
    private log = this.platform.log;

    constructor(
        private readonly platform: LutronRadioRA3Platform,
        private readonly accessory: PlatformAccessory,
        private readonly processor: Processor,
        private readonly button: ButtonDefinition,
        private readonly labelService: Service,
    ) {}

    private readonly buttonName = this.button.Engraving.Text || this.button.Name;

    async initialize(): Promise<DeviceWireResult> {
        const label = this.buttonName;

        this.service =
            this.accessory.getServiceById(this.platform.api.hap.Service.Switch, this.button.Name) ||
            this.accessory.addService(
                this.platform.api.hap.Service.Switch,
                label,
                this.button.Name,
            );

        this.service.addLinkedService(this.labelService);
        this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, label);

        this.service
            .getCharacteristic(this.platform.api.hap.Characteristic.On)
            .onSet(this.handleSet.bind(this))
            .updateValue(false);
        
        this.log.debug(`Subscribing to ${this.button.href} events`);
        this.processor.subscribeToButton(this.button, this.handleEvent.bind(this));

        return {
            kind: DeviceWireResultType.Success,
            name: label,
        };
    }

    private async handleSet(value: CharacteristicValue): Promise<void> {
        this.log.info(`Triggering button "${this.accessory.displayName} - ${this.buttonName}"`);
        try {
            await this.processor.pressButton(this.button);
        } catch (e) {
            this.log.error(`Failed to trigger button "${this.accessory.displayName} - ${this.buttonName}":`, e);
        }

        setTimeout(() => {
            this.service?.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue(false);
        }, RESET_DELAY_MS);
    }

    private handleEvent(response: Response): void {
        this.log.debug(`Received event:`, JSON.stringify(response));
    }
}
