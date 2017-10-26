/* eslint no-new-func:0 */
/* global describe, it */

var assert = require('assert')
var clones = require('clones')
var saferEval = require('..')

var isBrowser = (typeof window !== 'undefined')
// var isSafari = isBrowser && version(/Version\/(\d+).* Safari/)
// var isFirefox = isBrowser && version(/Firefox\/(\d+)/)
// var isEdge = isBrowser && version(/Edge\/(\d+)/)

function version (regex) { // eslint-disable-line no-unused-vars
  var m = regex.exec(navigator.userAgent)
  if (m) return m[1]
}

/**
* tests which are not recommended in normal usecases are marked with "EVIL"
* so YOU should not do this in your code
*/

describe('#saferEval', function () {
  it('should throw if code is not a string', function () {
    assert.throws(function () {
      saferEval(function () {})
    }, TypeError)
  })

  describe('should evaluate', function () {
    var tests = [
      ['[object String]', "'string'", 'string'],
      ['[object Number]', '3.1415', 3.1415],
      ['[object Boolean]', 'true', true],
      ['[object Null]', 'null', null],
      ['[object Undefined]', 'undefined', undefined],
      ['[object Array]', "[1, 2, '3']", [1, 2, '3']],
      ['[object Object]', '{a: "a", b: "b"}', {a: 'a', b: 'b'}],
      ['[object RegExp]', '/test/', /test/],
      ['[object Date]', 'new Date("1970-01-01T00:00:00")', new Date('1970-01-01T00:00:00')],
      ['[object Error]', 'new Error("boom")', new Error('boom')],
      ['[object Uint8Array]', 'new Uint8Array([0, 1, 2, 3])', new Uint8Array([0, 1, 2, 3])],
      ['[object Function]', 'function () { return 3 }', function () { return 3 }, true]
    ]
    tests.forEach(function (test) {
      var type = test[0]
      var inp = test[1]
      var exp = test[2]
      var iife = test[3]
      it('to ' + type + ' ' + inp, function () {
        var res = saferEval(inp, {iife: iife})

        assert.equal(toString.call(res), type)

        if (type === '[object Function]') {
          assert.equal(res(), exp())
        } else if (type === '[object Error]') {
          assert.equal(res.message, exp.message)
        } else if (type === '[object Uint8Array]') {
          assert.equal(res.toString(), exp.toString()) // can't deepEqual typed arrays on node4
        } else {
          assert.deepEqual(res, exp)
        }
      })
    })

    it('allowing console.log', function () {
      var res = saferEval('console.log("hurrah")')
      assert.equal(res, undefined)
    })

    it('setTimeout passing a function', function (done) {
      var res = saferEval('setTimeout(function () {Array._test = 111}, 5)', {iife: true})
      assert.ok(res)
      setTimeout(function () {
        assert.equal(Array._test, undefined)
        done()
      }, 10)
    })

    it('setInterval passing a function', function (done) {
      var res = saferEval('(function (){var id = setInterval(function () {Array._test = 111;  console.log("intervall"); clearInterval(id)}, 5)}())', {iife: true})
      assert.equal(res)
      setTimeout(function () {
        assert.equal(Array._test, undefined)
        done()
      }, 15)
    })

    if (!isBrowser) {
      it('to Buffer', function () {
        var res = saferEval("new Buffer('data')")
        assert.equal(toString.call(res), '[object Uint8Array]')
        assert.deepEqual(res, new Buffer('data'))
      })
    }

    it('on IIFE', function () {
      var res = saferEval('(function () { return 42 })()', {iife: true})
      assert.equal(toString.call(res), '[object Number]')
      assert.deepEqual(res, 42)
    })
  })

  describe('should evaluate with context', function () {
    if (isBrowser) {
      it('can pass navigator', function () {
        var code = `{d: new Date('1970-01-01'), b: navigator.userAgent}`
        var res = saferEval(code, {navigator: window.navigator})
        assert.equal(typeof res.b, 'string')
        // console.log(res.b)
      })
    }
  })

  describe('should protect against overwriting', function () {
    it('Math', function () {
      var res = saferEval(`(function () {
          Math.abs = function () {}
          if (Math.abs(4) !== undefined) {
            throw new Error()
          }
        })`, {iife: true}
      )
      res()
      assert.equal(Math.abs(-4), 4)
    })
    it('Math should work', function () {
      var res = saferEval(`Math.abs(-4)`)
      assert.equal(res, Math.abs(-4))
    })
    it('JSON', function () {
      var res = saferEval(`(function () {
          JSON.stringify = function () {}
          if (JSON.stringify({a: 1}) !== undefined) {
            throw new Error()
          }
        })`, {iife: true})
      res()
      assert.equal(JSON.stringify({a: 1}), '{"a":1}')
    })
    it('JSON should work', function () {
      var res = saferEval(`JSON.stringify({a: 1})`)
      assert.equal(res, '{"a":1}')
    })
    it('unescape', function () {
      saferEval('(unescape = function () { return 1 })', {iife: true})
      assert.ok(unescape.toString() !== 'function () { return 1 })')
    })
    it('console.log', function () {
      saferEval(`(function () {
        console.log = function () { return 1 }
        if (console.log() !== 1) {
          throw new Error()
        }
      })()`, {iife: true})
      assert.ok(console.log.toString() !== 'function () { return 1 })')
    })
    it('Array', function () {
      saferEval(`(function () {
        Array.prototype.reverse = function () { return 1 }
        Array.exploit = 1
      })()`, {iife: true})
      assert.ok(Array.prototype.reverse.toString() !== 'function () { return 1 })')
      assert.ok(Array.exploit === undefined)
    })
    it('Object', function () {
      var res = saferEval(`(function () {
          Object = {}
          Object.assign = function () {}
          if (Object.assign({a:1}, {b:1}) !== undefined) {
            throw new Error()
          }
        })`, {iife: true})
      res()
      assert.deepEqual(Object.assign({a: 1}, {b: 2}), {a: 1, b: 2})
    })
    it('Function', function () {
      var res = saferEval(`(function () {
        Function = function () { return function () { return 7 } }
        return Function("return 9 + 25")()
      })()`, {iife: true})
      assert.equal(res, 7)
      assert.equal(Function('return 9 + 25')(), 34)
    })
    it('new Function', function () {
      var res = saferEval(`(function () {
        Function = function () { return function () { return 7 } }
        return new Function("return 9 + 25")()
      })()`, {iife: true})
      assert.equal(res, 7)
      assert.equal(new Function('return 9 + 25')(), 34)
    })
    if (!isBrowser) {
      it('Buffer', function () {
        saferEval('(function () { Buffer.poolSize = "exploit"; })()', {iife: true})
        assert.ok(Buffer.poolSize !== 'exploit')
      })
    }
    it('setTimeout', function () {
      try {
        saferEval('(setTimeout = "exploit")')
      } catch (e) {}
      assert.ok(setTimeout !== 'exploit')
    })
  })

  describe('should not evaluate', function () {
    it('throws on eval', function () {
      let res
      try {
        res = saferEval('eval(9 + 25)')
      } catch (e) {}
      assert.equal(res, undefined)
    })

    it('to Function', function () {
      let res
      try {
        res = saferEval('new Function("return 9 + 25")')
      } catch (e) {}
      assert.equal(res, undefined)
    })

    it('setTimeout passing a string', function (done) {
      try {
        saferEval('setTimeout("Array._test = 111", 5)')
      } catch (e) {
        /setTimeout requires function as argument/.test(e)
      }
      setTimeout(function () {
        assert.equal(Array._test, undefined)
        done()
      }, 15)
    })

    it('setInterval passing a string', function (done) {
      try {
        saferEval('setInterval("Array._test = 111", 5)')
      } catch (e) {
        /setInterval requires function as argument/.test(e)
      }
      setTimeout(function () {
        assert.equal(Array._test, undefined)
        done()
      }, 15)
    })

    if (!isBrowser) {
      describe('in node', function () {
        it('setting a global variable', function () {
          try {
            saferEval('(global.exploit = "exploit")')
          } catch (e) {
            /TypeError/.test(e)
          }
          assert.equal(global.exploit, undefined)
        })
        it('should not allow using this.constructor.constructor', function () {
          let res
          try {
            res = saferEval("this.constructor.constructor('return process')()")
          } catch (e) {
            /TypeError/.test(e)
          }
          assert.equal(res, undefined)
        })
        it('should not allow using Object.constructor.constructor', function () {
          let res
          try {
            res = saferEval("Object.constructor.constructor('return process')()")
          } catch (e) {
            /TypeError/.test(e)
          }
          assert.equal(res, undefined)
        })
      })
    }

    if (isBrowser) {
      describe('in browser', function () {
        it('setting a global variable', function () {
          try {
            saferEval('(window.exploit = "exploit")')
          } catch (e) {}
          assert.equal(window.exploit, undefined)
        })
        it('should not allow using this.constructor.constructor', function () {
          let res
          try {
            res = saferEval("this.constructor.constructor('return window')()")
          } catch (e) {}
          assert.equal(res, undefined)
        })
        it('should not allow using Object.constructor.constructor', function () {
          let res
          try {
            res = saferEval("Object.constructor.constructor('return localStorage')()")
          } catch (e) {
          }
          assert.equal(res, undefined)
        })
      })
    }
  })

  describe('harmful context', function () {
    if (!isBrowser) {
      describe('in node', function () {
        it('EVIL - evaluates global.eval if passing global as context - which is a bad idea', function () {
          var res = saferEval('global.eval(9 + 25)', {global: global}) // !!! try to avoid passing global as context this way
          assert.equal(res, 34)
        })
        it('should not be able to exploit a global property', function () {
          global.myglobal = 'test'
          saferEval("(global.myglobal = 'exploited')", {global: clones(global)})
          assert.equal(global.myglobal, 'test')
        })
        it('should not be able to overwrite a global method', function () {
          saferEval('(global.setTimeout = undefined)', {global: clones(global)})
          assert.ok(global.setTimeout !== undefined)
        })
        it('should evaluate', function (done) {
          saferEval(`(function () {
            global.setTimeout(function () {
              global.console.log('hello')
            }, 10)
            global.clearTimeout = undefined
          })()`, {global: clones(global)}, {iife: true})
          setTimeout(function () {
            assert.ok(global.clearTimeout !== undefined)
            done()
          }, 30)
        })
      })
    }

    if (isBrowser) {
      describe('in browser', function () {
        it('evaluates window.eval', function () {
          this.timeout(10000)
          var res = saferEval('window.eval(9 + 25)', {window: window}) // !!! try to avoid passing a global context
          assert.equal(res, 34)
        })
        it('should not be able to exploit into a global property', function () {
          // FAILS on FF@56
          this.timeout(10000)
          try {
            saferEval("(window.myglobal = 'exploited')", clones({window: window}))
          } catch (e) {
          }
          assert.equal(window.myglobal, undefined)
        })
        it('using safer context', function () {
          var code = `[window.location.origin, window.screen.availWidth, window.btoa('Hello, world')]`
          var context = {
            window: {
              screen: window.screen, // can't wrap screen and location with clones
              location: window.location,
              btoa: clones(window.btoa, window)
            }
          }
          var res = saferEval(code, context)
          // console.log(res)
          assert.equal(res.length, 3)
          assert.equal(typeof res[0], 'string')
          assert.equal(typeof res[1], 'number')
          assert.equal(res[2], 'SGVsbG8sIHdvcmxk')
        })
        it('EVIL - should evaluate', function (done) {
          this.timeout(10000)
          saferEval(`(function () {
            window.setTimeout(function () {
              window.console.log('hello')
            }, 10)
            // window.clearTimeout = undefined // this is harmful!!!
          })()`, {window: window}, {iife: true}) // <= AVOID THIS
          setTimeout(function () {
            // assert.ok(window.clearTimeout !== undefined)
            done()
          }, 30)
        })
        it('should evaluate safely', function (done) {
          var context = {
            setTimeout: clones(setTimeout, window),
            clearTimeout: clones(clearTimeout, window),
            console: clones(console, console)
          }

          saferEval(`(function () {
            var start = Date.now()
            setTimeout(function () {
              console.log('hello', Date.now() - start)
            }, 10)
            clearTimeout = undefined
          })()`, context, {iife: true})
          setTimeout(function () {
            assert.ok(clearTimeout !== undefined)
            done()
          }, 30)
        })
      })
    }
  })

  describe('trying DoS', function () {
    it.skip('EVIL - hooks up the process ... an never comes back', function () {
      const res = saferEval('(function () { while (1) {} })()', {iife: true})
      console.log(res) // never reaches here
    })
    it('should not hook up the process as `function` is disallowed', function () {
      const serialized = `(\u0066\u0075\u006e\u0063\u0074\u0069\u006f\u006e(){ while (1) {} })()`
      assert.throws(() => {
        const res = saferEval(serialized)
      })
    })
    it('should run recursive function ... and throw with RangeError', function () {
      const serialized = `(
        function () {
          function recursive () {
            recursive()
          }
          recursive()
        })()
      `
      assert.throws(() => {
        const res = saferEval(serialized, {iife: true})
      })
    })
  })
})
