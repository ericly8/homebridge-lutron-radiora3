import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { DeviceWireResult, DeviceWireResultType, LutronRadioRA3Platform } from './platform';
import { OneZoneStatus, Processor, Response, ZoneDefinition, ZoneStatus } from './leap';

// Direct LEAP zone control, bypassing RA3's native HomeKit bridge entirely, so that a single
// switch/dimmer toggle goes over the same persistent local LEAP session as keypad buttons
// instead of whatever Lutron's own bridge does. Only ever wired up for zones the user has
// explicitly opted into (see GlobalOptions.zones) - the same physical load should not also be
// exported by RA3's native bridge, or it'll show up twice in the Home app.
export class ZoneAccessory {
    private service?: Service;
    private dimmable = false;
    private lastBrightness = 100;

    constructor(
        private readonly platform: LutronRadioRA3Platform,
        private readonly accessory: PlatformAccessory,
        private readonly processor: Processor,
        private readonly zone: ZoneDefinition,
    ) {}

    async initialize(): Promise<DeviceWireResult> {
        this.accessory
            .getService(this.platform.api.hap.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Lutron Electronics Co., Inc')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, this.zone.ControlType);

        this.dimmable = this.zone.ControlType === 'Dimmed';
        const isLight = this.zone.Category?.IsLight === true;

        if (this.dimmable || isLight) {
            this.service =
                this.accessory.getService(this.platform.api.hap.Service.Lightbulb) ||
                this.accessory.addService(this.platform.api.hap.Service.Lightbulb);
        } else {
            this.service =
                this.accessory.getService(this.platform.api.hap.Service.Switch) ||
                this.accessory.addService(this.platform.api.hap.Service.Switch);
        }
        this.service.setCharacteristic(this.platform.api.hap.Characteristic.Name, this.accessory.displayName);

        this.service.getCharacteristic(this.platform.api.hap.Characteristic.On).onSet(this.handleSetOn.bind(this));

        if (this.dimmable) {
            this.service
                .getCharacteristic(this.platform.api.hap.Characteristic.Brightness)
                .onSet(this.handleSetBrightness.bind(this));
        }

        let status: ZoneStatus;
        try {
            status = await this.processor.getZoneStatus(this.zone);
        } catch (e) {
            return {
                kind: DeviceWireResultType.Error,
                reason: `Failed to get initial status for zone ${this.accessory.displayName}: ${e}`,
            };
        }
        this.applyStatus(status);

        this.processor.subscribeToZoneStatus(this.zone, this.handleStatusEvent.bind(this));
        this.processor.on('disconnected', () => {
            this.platform.log.debug(`re-subscribing to ${this.zone.href} status after connection loss`);
            this.processor.subscribeToZoneStatus(this.zone, this.handleStatusEvent.bind(this));
        });

        return {
            kind: DeviceWireResultType.Success,
            name: this.accessory.displayName,
        };
    }

    private async handleSetOn(value: CharacteristicValue): Promise<void> {
        const level = value ? (this.lastBrightness > 0 ? this.lastBrightness : 100) : 0;
        try {
            await this.processor.setZoneLevel(this.zone, level);
        } catch (e) {
            this.platform.log.error(`Failed to set zone ${this.accessory.displayName} on/off:`, e);
        }
    }

    private async handleSetBrightness(value: CharacteristicValue): Promise<void> {
        const level = value as number;
        if (level > 0) {
            this.lastBrightness = level;
        }
        try {
            await this.processor.setZoneLevel(this.zone, level);
        } catch (e) {
            this.platform.log.error(`Failed to set zone ${this.accessory.displayName} brightness:`, e);
        }
    }

    private handleStatusEvent(response: Response): void {
        const status = (response.Body as OneZoneStatus)?.ZoneStatus;
        if (status !== undefined) {
            this.applyStatus(status);
        }
    }

    private applyStatus(status: ZoneStatus): void {
        const on = status.SwitchedLevel === 'On' || status.Level > 0;
        this.service?.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue(on);
        if (this.dimmable) {
            this.service?.getCharacteristic(this.platform.api.hap.Characteristic.Brightness).updateValue(status.Level);
            if (status.Level > 0) {
                this.lastBrightness = status.Level;
            }
        }
    }
}
