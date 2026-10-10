import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):/\.[cm]?[jt]sx?$/.test(entry.name)?[join(dir,entry.name).replaceAll('\\','/')]:[]);}
const files=walk('src'), entries=[];
for(const file of files){const text=readFileSync(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const writes=[],handlers=[],exports=[];function visit(node){
 if(ts.isFunctionDeclaration(node)&&node.modifiers?.some(item=>item.kind===ts.SyntaxKind.ExportKeyword))exports.push(node.name?.text??'default');
 if(ts.isCallExpression(node)){const name=node.expression.getText(source);if(/^(?:tx|db|getDb\(\))\.(?:insert|update|delete|transaction)$/.test(name)||/^(?:updateWorkspace|runOperation|mutate|mutateCalendar|confirmUpload|requestUpload|deleteAccount|completeOnboarding|createUpload|finishUpload|authenticate)$/.test(name)||/\.api\.(?:signUpEmail|signInEmail|signOut|resetPassword|requestPasswordReset)$/.test(name))writes.push({call:name,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1});}
 if(ts.isJsxAttribute(node)&&/^on(?:Submit|Click|Change|Drop|DragEnd|Confirm)$/.test(node.name.getText(source)))handlers.push({event:node.name.getText(source),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1});ts.forEachChild(node,visit);
 }visit(source);if(writes.length||handlers.length||/\/(?:page|route)\.tsx?$/.test(file))entries.push({file,exports,writes,handlers});}
const routes=files.filter(file=>/\/(?:page|route)\.tsx?$/.test(file));const modules=[...new Set(files.filter(file=>file.startsWith('src/components/')).map(file=>file.split('/')[2]))].sort();
const operations=[...readFileSync('src/lib/validation/operations.ts','utf8').matchAll(/kind:\s*z\.literal\("([^"]+)"\)/g)].map(match=>match[1]);
writeFileSync('docs/CRUD_MUTATION_INVENTORY.json',JSON.stringify({generatedAt:new Date().toISOString(),sourceFiles:files.length,routes,modules,operationKinds:operations,entries,limits:'AST inventory discovers routes, components, event handlers and persistent call sites. It is an audit index, not evidence that every handler was executed.'},null,2));
console.info(JSON.stringify({sourceFiles:files.length,routes:routes.length,modules:modules.length,operationKinds:operations,writeSites:entries.reduce((sum,row)=>sum+row.writes.length,0)}));
