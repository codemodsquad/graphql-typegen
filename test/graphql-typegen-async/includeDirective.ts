import * as path from 'path'

export const input = `
import gql from 'graphql-tag'

const query = gql\`
query Test($episode: Episode!, $include: Boolean!) {
  reviews(episode: $episode) @include(if: $include) {
    episode
    stars
  }
}
\`
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../starwars.graphql'),
}

export const expected = `
${input}
// @graphql-typegen auto-generated
type TestQueryVariables = {
  episode: 'NEWHOPE' | 'EMPIRE' | 'JEDI',
  include: boolean
}

// @graphql-typegen auto-generated
type TestQueryData = {
  reviews: ?Array<
    ?{
      episode: ?('NEWHOPE' | 'EMPIRE' | 'JEDI'),
      stars: number,
    }
  >,
}
`
