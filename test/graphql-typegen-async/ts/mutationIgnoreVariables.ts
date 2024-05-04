import * as path from 'path'

export const file = 'file.tsx'

export const input = `

import gql from 'graphql-tag'

const mutation = gql\`
# @graphql-typegen ignore variables
mutation createReview($episode: Episode!, $review: ReviewInput!) {
  createReview(episode: $episode, review: $review) {
    episode
    stars
    commentary
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

const mutation = gql\`
# @graphql-typegen ignore variables
mutation createReview($episode: Episode!, $review: ReviewInput!) {
  createReview(episode: $episode, review: $review) {
    episode
    stars
    commentary
  }
}
\`

// @graphql-typegen auto-generated
type CreateReviewMutationData = {
  createReview: {
    episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI' | null,
    stars: number,
    commentary: string | null,
  } | null,
}
`
