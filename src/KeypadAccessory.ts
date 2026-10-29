import { Service, PlatformAccessory } from 'homebridge';

import { GlobalOptions, LutronRadioRA3Platform, DeviceWireResult, DeviceWireResultType } from './platform';
import { ExceptionDetail, OneButtonStatusEvent, Response, Processor } from './leap';
import { KeypadButton } from './KeypadButton';

export class KeypadAccessory {
    private services: Map<string, Service> = new Map();

    constructor(
        private readonly platform: LutronRadioRA3Platform,
        private readonly accessory: PlatformAccessory,
        private readonly processor: Processor,
        private readonly options: GlobalOptions,
    ) {
        
    }

    async initialize(): Promise<DeviceWireResult> {
        this.accessory
            .getService(this.platform.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Lutron Electronics Co., Inc')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, this.accessory.context.device.ModelNumber)
            .setCharacteristic(
                this.platform.api.hap.Characteristic.SerialNumber,
                this.accessory.context.device.SerialNumber.toString(),
            );

        const labelService =
            this.accessory.getService(this.platform.api.hap.Service.ServiceLabel) ||
            this.accessory.addService(this.platform.api.hap.Service.ServiceLabel);
        labelService.setCharacteristic(
            this.platform.api.hap.Characteristic.ServiceLabelNamespace,
            this.platform.api.hap.Characteristic.ServiceLabelNamespace.ARABIC_NUMERALS,
        );

        let buttonGroups;
        try {
            buttonGroups = await this.processor.getDeviceButtonGroupsExpanded(this.accessory.context.device);
        } catch (e) {
            this.platform.log.error('Failed to get button groups belonging to', this.accessory.displayName, e);
            return {
                kind: DeviceWireResultType.Error,
                reason: `Failed to get button groups belonging to ${this.accessory.displayName}: ${e}`,
            };
        }

        buttonGroups.forEach((buttonGroup) => {
            if (buttonGroup instanceof ExceptionDetail) {
                return new Error('Device has been removed');
            }
        });

        for (const buttonGroup of buttonGroups) {
            for (const button of buttonGroup.Buttons) {
                if (button.Engraving?.Text === undefined) {
                    // Up/down buttons don't have engravings, so we skip them for now; they are not supported by the Home app.
                    continue;
                }

                const label = button.Engraving.Text || button.Name;
                this.platform.log.info(`setting up ${button.href} named ${label} numbered ${button.ButtonNumber}`);

                const keypadButton = new KeypadButton(this.platform, this.accessory, this.processor, button, labelService);
                const result = await keypadButton.initialize();
            }
        }

        this.platform.on('unsolicited', this.handleUnsolicited.bind(this));

        return {
            kind: DeviceWireResultType.Success,
            name: this.accessory.displayName,
        };
    }

    handleUnsolicited(response: Response): void {
        this.platform.log.debug(`Received unsolicited response:`, JSON.stringify(response));
    }
}
