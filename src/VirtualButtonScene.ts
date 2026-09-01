import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { DeviceWireResult, DeviceWireResultType, LutronRadioRA3Platform } from './platform';
import { Processor, VirtualButtonDefinition } from './leap';

// Home app switches are stateful, but a Lutron Virtual Button is momentary, so
// this flips itself back off shortly after being pressed to look/behave like a button.
const RESET_DELAY_MS = 1000;

export class VirtualButtonScene {
    private service?: Service;

    constructor(
        private readonly platform: LutronRadioRA3Platform,
        private readonly accessory: PlatformAccessory,
        private readonly processor: Processor,
        private readonly virtualButton: VirtualButtonDefinition,
    ) {}

    async initialize(): Promise<DeviceWireResult> {
        this.accessory
            .getService(this.platform.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Lutron Electronics Co., Inc')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, 'Virtual Button');

        this.service =
            this.accessory.getService(this.platform.api.hap.Service.Switch) ||
            this.accessory.addService(this.platform.api.hap.Service.Switch);
        this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, this.accessory.displayName);

        this.service
            .getCharacteristic(this.platform.api.hap.Characteristic.On)
            .onSet(this.handleSet.bind(this))
            .updateValue(false);

        return {
            kind: DeviceWireResultType.Success,
            name: this.accessory.displayName,
        };
    }

    private async handleSet(value: CharacteristicValue): Promise<void> {
        if (!value) {
            // ignore the "off" write this triggers on itself below
            return;
        }

        this.platform.log.info(`Triggering scene "${this.accessory.displayName}"`);
        try {
            await this.processor.pressVirtualButton(this.virtualButton);
        } catch (e) {
            this.platform.log.error(`Failed to trigger scene "${this.accessory.displayName}":`, e);
        }

        setTimeout(() => {
            this.service?.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue(false);
        }, RESET_DELAY_MS);
    }
}
