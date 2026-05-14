/// <reference types="vite/client" />

declare module '*.hbs?raw' {
    const content: string;
    export default content;
}

declare module '*.hbs' {
    const template: string;
    export default template;
}
