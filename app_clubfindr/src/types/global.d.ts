declare global {
    namespace NodeJS {
        interface Global {
            originalXMLHttpRequest: typeof XMLHttpRequest;
            originalFormData: typeof FormData;
            __DEV__: boolean;
        }
    }
}

// Ensure __DEV__ is available on the global object
declare const global: NodeJS.Global;
declare const __DEV__: boolean;

export { };
