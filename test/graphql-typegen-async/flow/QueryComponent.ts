import * as path from 'path'

export const file = 'file.js'

export const input = `
// @flow
import * as React from 'react'
import { Query } from '@apollo/react-components'
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`

const Comp = ({id: string}): React.Node => (
  <Query query={query} variables={{id}}>
    {({loading, error, data}): React.Node => (
      <div />
    )}
  </Query>
)
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
// @flow
import * as React from 'react'
import { Query, type QueryRenderProps } from '@apollo/react-components'
import gql from 'graphql-tag'

const query = gql\`
query Test($id: ID!) {
  character(id: $id) {
    id
    name
    appearsIn
  }
}
\`

// @graphql-typegen auto-generated
type TestQueryVariables = { id: string }

// @graphql-typegen auto-generated
type TestQueryData = {
  character: ?{
    id: string,
    name: string,
    appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
  },
}


const Comp = ({id: string}): React.Node => (
  <Query query={query} variables={({id}: TestQueryVariables)}>
    {({loading, error, data}: QueryRenderProps<TestQueryData, TestQueryVariables>): React.Node => (
      <div />
    )}
  </Query>
)
`
