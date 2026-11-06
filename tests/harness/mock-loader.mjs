const mocks = {
  "@earendil-works/pi-ai": "data:text/javascript,export const Type={String:(x={})=>({type:'string',...x}),Array:(x,o={})=>({type:'array',items:x,...o}),Object:(x)=>({type:'object',properties:x})};",
  "@earendil-works/pi-coding-agent": "data:text/javascript,export const defineTool=(x)=>x;",
};
export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}
