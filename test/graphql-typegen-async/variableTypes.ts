import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test(
  $id: ID!
  $foo: [Float!]
  $bar: [Int]
  $baz: Boolean
  $date: Date
) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'
import { type DateISOString } from '../../src/DateISOString'

const query = gql\`
query Test(
  $id: ID!
  $foo: [Float!]
  $bar: [Int]
  $baz: Boolean
  $date: Date
) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`

// @graphql-typegen auto-generated
type TestQueryVariables = {
  id: string,
  foo?: ?Array<number>,
  bar?: ?Array<?number>,
  baz?: ?boolean,
  date?: ?DateISOString,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  character: ?{
    id: string,
    name: string,
    appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
  },
}
`
