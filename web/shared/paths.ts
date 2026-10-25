export function staticDemo(): boolean { return location.pathname === '/demo' || location.pathname.startsWith('/demo/'); }
export function pagePath(path: string): string { return staticDemo() ? `/demo${path}` : path; }
export function routePath(path = location.pathname): string { return staticDemo() ? path.slice('/demo'.length) || '/' : path; }
