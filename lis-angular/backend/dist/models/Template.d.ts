export interface Template {
    id: string;
    name: string;
    test_type: string | null;
    fields: any[];
    footer_notes: string | null;
    is_active: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}
export declare const TemplateModel: {
    findAll(activeOnly?: boolean): Template[];
    findById(id: string): Template | null;
    findByTestType(testType: string): Template[];
    create(data: {
        name: string;
        test_type?: string;
        fields?: any[];
        footer_notes?: string;
        created_by?: string;
    }): Template;
    update(id: string, data: Partial<Template>): Template | null;
    delete(id: string): boolean;
    count(): number;
};
//# sourceMappingURL=Template.d.ts.map