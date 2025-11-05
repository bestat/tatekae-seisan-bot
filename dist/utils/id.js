"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRequestId = generateRequestId;
const date_fns_tz_1 = require("date-fns-tz");
function generateRequestId(prefix, timezone) {
    const datePart = (0, date_fns_tz_1.formatInTimeZone)(new Date(), timezone, 'yyyyMMdd');
    const randomPart = Math.random().toString(36).slice(-4).toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
}
