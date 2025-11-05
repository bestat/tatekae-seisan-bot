"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowInTimeZone = nowInTimeZone;
const date_fns_tz_1 = require("date-fns-tz");
function nowInTimeZone(timezone) {
    return (0, date_fns_tz_1.formatInTimeZone)(new Date(), timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
