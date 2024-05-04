import * as path from 'path'

export const file = 'file.tsx'

export const input = `

import * as React from 'react'
import { Mutation } from '@apollo/react-components'
import gql from 'graphql-tag'

const mutation = gql\`
mutation createReview($episode: Episode!, $review: ReviewInput!) {
  createReview(episode: $episode, review: $review) {
    episode
    stars
    commentary
  }
}
\`

const Comp = ({id: string}): React.Node => (
  <Mutation mutation={mutation}>
    {(createReview): React.Node => (
      <div />
    )}
  </Mutation>
)
`

export const options = {
  addTypename: false,
  useFunctionTypeArguments: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `

import * as React from 'react'
import { Mutation, type MutationFunction } from '@apollo/react-components'
import gql from 'graphql-tag'

const mutation = gql\`
mutation createReview($episode: Episode!, $review: ReviewInput!) {
  createReview(episode: $episode, review: $review) {
    episode
    stars
    commentary
  }
}
\`

// @graphql-typegen auto-generated
type CreateReviewMutationFunction = MutationFunction<
  CreateReviewMutationData,
  CreateReviewMutationVariables
>

// @graphql-typegen auto-generated
type CreateReviewMutationVariables = {
  episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI',
  review: {
    stars: number,
    commentary?: string | null,
    favorite_color?: {
      red: number,
      green: number,
      blue: number,
    } | null
  }
}

// @graphql-typegen auto-generated
type CreateReviewMutationData = {
  createReview: {
    episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI' | null,
    stars: number,
    commentary: string | null,
  } | null,
}

const Comp = ({id: string}): React.Node => (
  <Mutation mutation={mutation}>
    {(createReview: CreateReviewMutationFunction): React.Node => (
      <div />
    )}
  </Mutation>
)
`
