import * as path from 'path'

export const file = 'file.tsx'
export const normalize = false

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

const Comp = (props: {id: string}): React.Node => {
  const [createReview] = useMutation<X>(mutation)
  return <div />
}
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `

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

// @graphql-typegen auto-generated
type CreateReviewMutationVariables = {
  episode: "NEWHOPE" | "EMPIRE" | "JEDI",
  review: {
    stars: number,
    commentary?: string | null,
    favorite_color?: {
      red: number,
      green: number,
      blue: number
    } | null
  }
};

// @graphql-typegen auto-generated
type CreateReviewMutationData = {
  createReview: {
    episode: "NEWHOPE" | "EMPIRE" | "JEDI" | null,
    stars: number,
    commentary: string | null
  } | null
};

const Comp = (props: {id: string}): React.Node => {
  const [createReview] = useMutation<CreateReviewMutationData, CreateReviewMutationVariables>(mutation)
  return <div />
}
`
