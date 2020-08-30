import * as path from 'path'

export const file = 'file.js'

export const input = `
// @flow
import gql from 'graphql-tag'

const mutation = gql\`
mutation testExtractInput(
  # @graphql-typegen extract
  $input: TestExtractInput!
) {
  testExtractInput(input: $input)
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
// @flow
import gql from 'graphql-tag'
import { type DateISOString } from '../../src/DateISOString'
const mutation = gql\`
mutation testExtractInput(
  # @graphql-typegen extract
  $input: TestExtractInput!
) {
  testExtractInput(input: $input)
}
\`
// @graphql-typegen auto-generated
type TestExtractInputMutationVariables = { input: TestExtractInput }
// @graphql-typegen auto-generated
type TestExtractInput = {
  foo: string,
  bar: number,
  date?: ?DateISOString,
  json?: ?mixed,
}
// @graphql-typegen auto-generated
type TestExtractInputMutationData = { testExtractInput: ?boolean }
`
