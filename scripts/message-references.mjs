import ts from "typescript";

/** Resolve translator bindings within their lexical scope, including nested namespaces. */
export function messageReferences(source, path) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const references = [];
  function inspect(node, bindings) {
    const scope = ts.isSourceFile(node) || ts.isBlock(node) ? new Map(bindings) : bindings;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      let initializer = node.initializer;
      if (initializer && ts.isAwaitExpression(initializer)) initializer = initializer.expression;
      let namespace;
      if (initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)
        && ["getTranslations", "useTranslations"].includes(initializer.expression.text)) {
        const options = initializer.arguments[0];
        if (options && ts.isStringLiteral(options)) namespace = options.text;
        if (options && ts.isObjectLiteralExpression(options)) {
          const property = options.properties.find(item => ts.isPropertyAssignment(item)
            && item.name.getText(tree) === "namespace");
          if (property && ts.isStringLiteral(property.initializer)) namespace = property.initializer.text;
        }
      }
      // A local variable can shadow a translator from an outer scope.
      scope.set(node.name.text, namespace);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const namespace = scope.get(node.expression.text);
      if (namespace === "studyflow" || namespace?.startsWith("studyflow.")) {
        const prefix = namespace === "studyflow" ? "" : `${namespace.slice("studyflow.".length)}.`;
        function literalKeys(argument) {
          if (argument && ts.isStringLiteral(argument)) references.push(`${prefix}${argument.text}`);
          else if (argument && ts.isConditionalExpression(argument)) {
            literalKeys(argument.whenTrue);
            literalKeys(argument.whenFalse);
          }
        }
        literalKeys(node.arguments[0]);
      }
    }
    ts.forEachChild(node, child => inspect(child, scope));
  }
  inspect(tree, new Map());
  return references;
}
