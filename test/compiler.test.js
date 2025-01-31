import { describe, it } from 'node:test';
import { deepEqual } from 'node:assert/strict';
import "../src/gitz.js";

describe('compiler', () => {
    it('is alive', () => {
        deepEqual(1, 1);
    });
});
