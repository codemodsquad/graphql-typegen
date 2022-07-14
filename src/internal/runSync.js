#! /usr/bin/env node

/* eslint-disable */

const { target, method, ...options } = JSON.parse(process.argv[2])
// istanbul ignore next
if (/\.ts$/.test(target)) {
  require('@babel/register')({ extensions: ['.js', '.ts'] })
}
require(target)
  [method](options)
  .then(
    function (result) {
      process.stdout.write(JSON.stringify(result), function () {
        process.exit(0)
      })
    },
    function (error) {
      console.error(error.stack) // eslint-disable-line no-console
      process.exit(1)
    }
  )
