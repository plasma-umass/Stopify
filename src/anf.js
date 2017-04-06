/**
 * Plugin to transform JS programs into ANF form.
 *
 * WARNING:
 * The plugin assumes that the assumptions stated in ./src/desugarLoop.js
 * hold. The resulting output is not guarenteed to be in ANF form if the
 * assumptions do not hold.
 */

const t = require('babel-types');
const h = require('./helpers.js');

// Object to contain the visitor functions
const visitor = {};

visitor.CallExpression = function (path) {
  if (h.isConsoleLog(path.node.callee)) return;

  const p = path.parent;
  // Name the function application if it is not already named.
  if (t.isVariableDeclarator(p) === false) {
    path.node.anfed = true;
    const name = path.scope.generateUidIdentifier('app');
    const bind = h.letExpression(name, path.node);
    path.getStatementParent().insertBefore(bind);
    path.replaceWith(name);
  }
};

// Consequents and alternatives in if statements must always be blocked,
// otherwise variable declaration get pulled outside the branch.
visitor.IfStatement = function (path) {
  const { consequent, alternate } = path.node;

  if (t.isBlockStatement(consequent) === false) {
    path.node.consequent = t.blockStatement([consequent]);
  }

  if (alternate !== null && t.isBlockStatement(alternate) === false) {
    path.node.alternate = t.blockStatement([alternate]);
  }
}

module.exports = function transform(babel) {
  return { visitor };
};
