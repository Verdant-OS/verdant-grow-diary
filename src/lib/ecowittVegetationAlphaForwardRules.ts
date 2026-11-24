/**
 * Local planner for the #3090 Vegetation Alpha EcoWitt forward.
 * Builds a reviewed SQL statement. It does not open a database connection.
 */

import { isEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";

export class EcowittVegetationAlphaForwardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcowittVegetationAlphaForwardError";
  }
}

export interface EcowittVegetationAlphaConfig {
  readonly tentId: string;
  readonly airChannels: readonly number[];
  readonly soilChannels: readonly number[];
  readonly passkeyFingerprint: string;
}

export class EcowittVegetationAlphaForward {
  /** Authoritative tent. Names are not unique; never select by display name. */
  static readonly targetTentId = "78f51773-c576-4891-a9aa-240ed532337a";

  /** Nov 6 Flower-only target. This forward must not write that row. */
  static readonly retiredFlowerTentId = "eec6f7b3-b745-44ad-bab2-ed4ad79f88f5";

  static parseChannelList(raw: string | undefined, label: string): number[] {
    if (raw === undefined || raw.trim() === "") {
      throw new EcowittVegetationAlphaForwardError(
        `${label} is required. Read the channel number from the gateway before continuing.`,
      );
    }
    const parts = raw.split(",").map((part) => part.trim());
    if (parts.length === 0 || parts.some((part) => part === "")) {
      throw new EcowittVegetationAlphaForwardError(`${label} must list integers from 1 to 8.`);
    }
    const channels = parts.map((part) => {
      if (!/^[1-8]$/.test(part)) {
        throw new EcowittVegetationAlphaForwardError(
          `${label} must be integers from 1 to 8. Received an invalid channel.`,
        );
      }
      return Number(part);
    });
    return [...new Set(channels)].sort((a, b) => a - b);
  }

  static buildConfig(input: {
    readonly air: string | undefined;
    readonly soil: string | undefined;
    readonly passkeyFingerprint: string;
  }): EcowittVegetationAlphaConfig {
    if (!isEcoWittPasskeyFingerprint(input.passkeyFingerprint)) {
      throw new EcowittVegetationAlphaForwardError(
        "passkey_fingerprint must be ewfp_ plus 24 hex characters.",
      );
    }
    return {
      tentId: EcowittVegetationAlphaForward.targetTentId,
      airChannels: EcowittVegetationAlphaForward.parseChannelList(input.air, "air_channels"),
      soilChannels: EcowittVegetationAlphaForward.parseChannelList(input.soil, "soil_channels"),
      passkeyFingerprint: input.passkeyFingerprint,
    };
  }

  /** Idempotent update of one tent. Other tents, including Flower, are untouched. */
  static renderScopedUpdateSql(config: EcowittVegetationAlphaConfig): string {
    if (config.tentId !== EcowittVegetationAlphaForward.targetTentId) {
      throw new EcowittVegetationAlphaForwardError("SQL is scoped to the Vegetation Alpha tent id.");
    }
    const air = EcowittVegetationAlphaForward.sqlIntArray(config.airChannels);
    const soil = EcowittVegetationAlphaForward.sqlIntArray(config.soilChannels);
    const fingerprint = EcowittVegetationAlphaForward.sqlString(config.passkeyFingerprint);
    const tent = EcowittVegetationAlphaForward.sqlString(config.tentId);
    return [
      "UPDATE public.tents",
      "SET hardware_config = jsonb_set(",
      "  COALESCE(hardware_config, '{}'::jsonb),",
      "  '{ecowitt}',",
      "  COALESCE(hardware_config->'ecowitt', '{}'::jsonb) || jsonb_build_object(",
      `    'air_channels', ${air}::jsonb,`,
      `    'soil_channels', ${soil}::jsonb,`,
      `    'passkey_fingerprint', ${fingerprint}::text`,
      "  ),",
      "  true",
      ")",
      `WHERE id = ${tent}::uuid`,
      "RETURNING id, hardware_config->'ecowitt' AS ecowitt;",
    ].join("\n");
  }

  static publicText(config: EcowittVegetationAlphaConfig, sql: string): string {
    return JSON.stringify({
      tent_id: config.tentId,
      air_channels: config.airChannels,
      soil_channels: config.soilChannels,
      passkey_fingerprint: config.passkeyFingerprint,
      sql,
    });
  }

  static assertSecretAbsent(text: string, secret: string): void {
    const trimmed = secret.trim();
    if (trimmed.length > 0 && text.includes(trimmed)) {
      throw new EcowittVegetationAlphaForwardError("Refusing to emit the raw passkey.");
    }
  }

  private static sqlIntArray(channels: readonly number[]): string {
    const values = channels.map((channel) => {
      if (!Number.isInteger(channel) || channel < 1 || channel > 8) {
        throw new EcowittVegetationAlphaForwardError("Channel out of range.");
      }
      return String(channel);
    });
    return `'[${values.join(",")}]'`;
  }

  private static sqlString(value: string): string {
    if (value.includes("'") || value.includes("\\") || value.includes("\n")) {
      throw new EcowittVegetationAlphaForwardError("Refusing an unsafe SQL literal.");
    }
    return `'${value}'`;
  }
}
