import * as path from 'path'

export const file = 'file.tsx'
export const normalize = false

export const input = `

import * as React from 'react'
import { useQuery } from '@apollo/react-hooks'
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

const Comp = ({id: string}): React.Node => {
  const {loading, error, data} = useQuery(query, {
    variables: {id},
  })
  return <div />
}
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `

import * as React from 'react'
import { useQuery } from '@apollo/react-hooks'
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
type TestQueryVariables = {
  id: string
};

// @graphql-typegen auto-generated
type TestQueryData = {
  character: {
    id: string,
    name: string,
    appearsIn: Array<"NEWHOPE" | "EMPIRE" | "JEDI" | null>
  } | null
};

const Comp = ({id: string}): React.Node => {
  const {loading, error, data} = useQuery<TestQueryData, TestQueryVariables>(query, {
    variables: {id},
  })
  return <div />
}
`
