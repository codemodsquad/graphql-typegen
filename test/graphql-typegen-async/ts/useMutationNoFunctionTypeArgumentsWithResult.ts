import * as path from 'path'

export const file = 'file.tsx'

export const input = `

import * as React from 'react'
import { useMutation } from '@apollo/react-hooks'
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

const Comp = ({id: string}): React.Node => {
  const [createReview, result] = useMutation(mutation)
  return <div />
}
`

export const options = {
  addTypename: false,
  useFunctionTypeArguments: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `

import * as React from 'react'
import { useMutation, type MutationFunction, type MutationResult } from '@apollo/react-hooks'
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

const Comp = ({id: string}): React.Node => {
  const [createReview, result]: [
    CreateReviewMutationFunction,
    MutationResult<CreateReviewMutationData>
  ] = useMutation(mutation)
  return <div />
}
`
