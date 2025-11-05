"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionValidationError = void 0;
class SubmissionValidationError extends Error {
    constructor(errors) {
        super('Submission validation failed');
        this.errors = errors;
    }
}
exports.SubmissionValidationError = SubmissionValidationError;
