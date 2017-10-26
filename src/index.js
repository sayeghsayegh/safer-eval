/**
* @copyright 2017 Commenthol
* @license MIT
*/

'use strict'

const vm = require('vm')
const {createContext, allow, noIIFE} = require('./common')

/**
* reuse saferEval context
* @class
* @example
* const {SaferEval} = require('safer-eval')
* const safer = new SaferEval()
* let res1 = safer.runInContext('new Date('1970-01-01')')
* let res2 = safer.runInContext('new Date('1970-07-01')')
*/
class SaferEval {
  /**
  * @param {Object} [context] - allowed context
  * @param {Object} [options] - options for `vm.runInContext`
  * @param {Boolean} [options.iife] - explicitely allow Immediately-invoked function expression IIFE
  */
  constructor (context, options) {
    options = options || {}
    if (context && 'iife' in context) {
      options = context
      context = undefined
    }
    // define disallowed objects in context
    const __context = createContext()
    // apply "allowed" context vars
    allow(context, __context)

    this._context = vm.createContext(__context)
    this._options = options
    this._optionNoIIFE = !options.iife
  }

  /**
  * @param {String} code - a string containing javascript code
  * @return {Any} evaluated code
  */
  runInContext (code) {
    if (typeof code !== 'string') {
      throw new TypeError('not a string')
    }
    if (this._optionNoIIFE) code = noIIFE(code)
    return vm.runInContext(
      '(function () {"use strict"; return ' + code + '})()',
      this._context,
      this._options
    )
  }
}

/**
* A safer approach for eval. (node)
*
* In node the `vm` module is used to sandbox the evaluation of `code`.
*
* `context` allows the definition of passed in Objects into the sandbox.
* Take care, injected `code` can overwrite those passed context props!
* Check the tests under "harmful context"!
*
* @static
* @throws Error
* @param {String} code - a string containing javascript code
* @param {Object} [context] - define globals, properties for evaluation context
* @param {Object} [options]
* @param {Boolean} [options.iife] - explicitely allow Immediately-invoked function expression IIFE
* @return {Any} evaluated code
* @example
* var code = `{d: new Date('1970-01-01'), b: new Buffer('data')}`
* var res = saferEval(code, {Buffer: Buffer})
* // => toString.call(res.d) = '[object Date]'
* // => toString.call(res.b) = '[object Buffer]'
*/
function saferEval (code, context, options) {
  return new SaferEval(context, options).runInContext(code)
}

module.exports = saferEval
module.exports.SaferEval = SaferEval
