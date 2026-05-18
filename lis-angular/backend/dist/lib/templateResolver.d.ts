/**
 * Shared helper to determine which result template to use for a given test.
 * Ported from lis-fullstack/lib/templateResolver.js
 *
 * BUG FIX: Specific test types (hematology, xray, thyroid, serology) are now
 * matched BEFORE the generic 'blood/chem' catch-all that was incorrectly
 * routing them to blood-chemistry.
 */
export declare function getResultTemplate(test: {
    test_type?: string;
    template?: string;
}): string;
//# sourceMappingURL=templateResolver.d.ts.map