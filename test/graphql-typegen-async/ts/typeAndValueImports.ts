import * as path from 'path'

export const input = `
import gql from 'graphql-tag'
import { DateISOString } from 'date-iso-string'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    # @graphql-typegen external as import { type Blah } from 'date-iso-string'
    appearsIn
    # @graphql-typegen external as import { type DateISOString } from 'date-iso-string'
    birthday
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
import gql from 'graphql-tag'
import { DateISOString, type Blah } from 'date-iso-string'

const query = gql\`
query Test($id: ID!) {
  human(id: $id) {
    id
    name
    # @graphql-typegen external as import { type Blah } from 'date-iso-string'
    appearsIn
    # @graphql-typegen external as import { type DateISOString } from 'date-iso-string'
    birthday
  }
}
\`
// @graphql-typegen auto-generated
type TestQueryVariables = {
  id: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  human: {
    id: string,
    name: string,
    appearsIn: Array<Blah | null>,
    birthday: DateISOString | null,
  } | null,
}
`
