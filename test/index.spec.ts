/* eslint-disable @typescript-eslint/no-var-requires */

import { describe } from 'mocha'
import * as fs from 'fs'
import * as path from 'path'
import testFixtures from './testFixtures'

for (const dir of fs.readdirSync(__dirname)) {
  if (
    dir !== 'fakePackage' &&
    fs.statSync(path.join(__dirname, dir)).isDirectory()
  ) {
    describe(dir, function() {
      this.timeout(10000)
      testFixtures({
        glob: path.join(__dirname, dir, '*.ts'),
        transform: require(`../src/${dir}`),
        defaultParser: 'babylon',
      })
    })
  }
}
