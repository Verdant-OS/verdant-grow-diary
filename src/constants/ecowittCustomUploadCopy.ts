/**
 * Grower-facing copy for the EcoWitt customized-upload station card.
 * Copy is data so tests can pin the exact strings.
 */
export const ECOWITT_CUSTOM_UPLOAD_COPY = {
  sectionLabel: "EcoWitt live station",
  empty: "No live data",
  stale: "Stale",
  live: "Live",
  airTemp: "Air temperature",
  airRh: "Air RH",
  soil1: "Soil moisture 1",
  co2: "CO2",
  lastReading: "Last reading",
  settingsTitle: "Gateway customized upload",
  uploadMode: "Customized",
  protocol: "Ecowitt",
  port: "80",
  interval: "16",
  pathPlaceholder: "ew/<claim token>",
  enable: "Enable",
  tokenOnce: "The claim token is shown once, when you create the link.",
  createLink: "Create EcoWitt link",
  createFailed: "Couldn’t create the EcoWitt link.",
  revokeLink: "Revoke EcoWitt link",
  rotateLink: "Rotate EcoWitt link",
  revokeFailed: "Couldn’t revoke the EcoWitt link.",
  rotateFailed: "Couldn’t rotate the EcoWitt link.",
  lookupFailed: "Couldn’t load the EcoWitt link.",
} as const;
