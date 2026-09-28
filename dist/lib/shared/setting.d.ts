/** A numeric setting: the explicit option, else its env var, else the default. */
export declare function setting(options: {
    value: number | undefined;
    env: string;
    min: number;
    fallback: number;
}): number;
/**
 * The identity a connector shows the server: `appName`, else `INSTANCE_NAME`.
 * There is no default — a connector without one throws `MISSING_APP_NAME`.
 */
export declare function appName(options: {
    value: string | undefined;
    connector: string;
}): string;
//# sourceMappingURL=setting.d.ts.map