export interface UserPermissions {
    dashboard?: boolean;
    patients?: boolean;
    reception?: boolean;
    tests?: boolean;
    reports?: boolean;
    worksheet?: boolean;
    templates?: boolean;
    users?: boolean;
    delete?: boolean;
}
export interface User {
    id: string;
    name: string;
    email: string;
    password: string;
    role: string;
    status: string;
    license_number: string | null;
    signature: string | null;
    auto_signature_enabled: number;
    auto_signature_until: string | null;
    permissions: UserPermissions;
    created_at: string;
    last_login: string | null;
}
export interface UserRow {
    id: string;
    name: string;
    email: string;
    password: string;
    role: string;
    status: string;
    license_number: string | null;
    signature: string | null;
    auto_signature_enabled: number;
    auto_signature_until: string | null;
    permissions: string;
    created_at: string;
    last_login: string | null;
}
export declare const UserModel: {
    findAll(): User[];
    findById(id: string): User | null;
    findByEmail(email: string): User | null;
    create(data: {
        name: string;
        email: string;
        password: string;
        role?: string;
        license_number?: string;
        permissions?: UserPermissions;
    }): Promise<User>;
    update(id: string, data: Partial<{
        name: string;
        email: string;
        password: string;
        role: string;
        status: string;
        license_number: string;
        signature: string;
        auto_signature_enabled: number;
        auto_signature_until: string;
        permissions: UserPermissions;
        last_login: string;
    }>): User | null;
    delete(id: string): boolean;
    count(): number;
    verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
};
//# sourceMappingURL=User.d.ts.map