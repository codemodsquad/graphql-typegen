import * as path from 'path'

export const file = 'file.js'

export const input = `
// @flow
import gql from 'graphql-tag'

const mutation = gql\`
# @graphql-typegen ignore
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

export const expected = input
