import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const subscription = gql\`
subscription Test($episode: Episode!) {
  reviewAdded(episode: $episode) {
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
${input}

// @graphql-typegen auto-generated
type TestSubscriptionVariables = {
  episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI',
}

// @graphql-typegen auto-generated
type TestSubscriptionData = {
  reviewAdded: {
    episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI' | null,
    stars: number,
    commentary: string | null,
  } | null,
}
`
