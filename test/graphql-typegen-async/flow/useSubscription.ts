import * as path from 'path'

export const input = `
// @flow
import * as React from 'react'
import { useSubscription } from '@apollo/react-hooks'
import gql from 'graphql-tag'

const subscription = gql\`
subscription Test(
  # @graphql-typegen extract
  $episode: Episode!
) {
  reviewAdded(episode: $episode) {
    episode
    stars
    commentary
  }
}
\`

const Comp = ({episode}: {episode: Episode}): React.Node => {
  const data = useSubscription(subscription, {
    variables: {episode}
  })
  return <div />
}
`

export const options = {
  addTypename: false,
  schemaFile: path.resolve(__dirname, '../../../starwars.graphql'),
}

export const expected = `
// @flow
import * as React from 'react'
import { useSubscription } from '@apollo/react-hooks'
import gql from 'graphql-tag'

const subscription = gql\`
subscription Test(
  # @graphql-typegen extract
  $episode: Episode!
) {
  reviewAdded(episode: $episode) {
    episode
    stars
    commentary
  }
}
\`

// @graphql-typegen auto-generated
type TestSubscriptionVariables = { episode: Episode }

// @graphql-typegen auto-generated
type Episode = 'NEWHOPE' | 'EMPIRE' | 'JEDI' 

// @graphql-typegen auto-generated
type TestSubscriptionData = {
  reviewAdded: ?{
    episode: ?('NEWHOPE' | 'EMPIRE' | 'JEDI'),
    stars: number,
    commentary: ?string,
  },
}

const Comp = ({episode}: {episode: Episode}): React.Node => {
  const data = useSubscription<TestSubscriptionData, TestSubscriptionVariables>(
    subscription, {
      variables: { episode }
    }
  )
  return <div />
}
`
