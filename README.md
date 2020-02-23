# graphql-typegen

[![CircleCI](https://circleci.com/gh/codemodsquad/graphql-typegen.svg?style=svg)](https://circleci.com/gh/codemodsquad/graphql-typegen)
[![Coverage Status](https://codecov.io/gh/codemodsquad/graphql-typegen/branch/master/graph/badge.svg)](https://codecov.io/gh/codemodsquad/graphql-typegen)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/graphql-typegen.svg)](https://badge.fury.io/js/graphql-typegen)

JSCodeshift transform that inserts Flow types generated from GraphQL documents in template string literals and your GraphQL schema

# Table of Contents

<!-- toc -->

- [Example](#example)
  - [Before](#before)
  - [After](#after)
- [Rationale](#rationale)
  - [Importing generated types from external files is annoying](#importing-generated-types-from-external-files-is-annoying)
  - [`graphql-codegen` outputs messy types for documents](#graphql-codegen-outputs-messy-types-for-documents)
  - [I want to extract parts of the query with their own type aliases](#i-want-to-extract-parts-of-the-query-with-their-own-type-aliases)
  - [Interpolation in GraphQL tagged template literals](#interpolation-in-graphql-tagged-template-literals)
  - [Automatically adding type annotations to `Query`, `Mutation`, `useQuery`, `useMutation`, and `useSubscription`](#automatically-adding-type-annotations-to-query-mutation-usequery-usemutation-and-usesubscription)
- [Configuration](#configuration)
  - [`schemaFile` / `server`](#schemafile--server)
  - [`tagName` (default: `gql`)](#tagname-default-gql)
  - [`addTypename` (default: `true`)](#addtypename-default-true)
  - [`objectType` (default: `ambiguous`)](#objecttype-default-ambiguous)
  - [`useReadOnlyTypes` (default: `false`)](#usereadonlytypes-default-false)
  - [`useFunctionTypeArguments` (default: `true`)](#usefunctiontypearguments-default-true)
  - [`external as`](#external-as-)
  - [`extract [as ]`](#extract-as-)
- [CLI Usage](#cli-usage)
- [Node.js API](#nodejs-api)

<!-- tocstop -->

# Example

## Before

```js
import gql from 'graphql-tag'

const fragment = gql`
  fragment CharacterFields on Character {
    name
    appearsIn
  }
`

const fragment2 = gql`
  ${fragment}
  fragment CharacterAndFriends on Character {
    ...CharacterFields
    friends {
      ...CharacterFields
    }
  }
`

const query = gql`
  ${fragment2}
  query Test($id: ID!) {
    character(id: $id) {
      id
      ...CharacterAndFriends
    }
  }
`
```

## After

```js
import gql from 'graphql-tag'

const fragment = gql`
  fragment CharacterFields on Character {
    name
    appearsIn
    ... on Human {
      mass
    }
    ... on Droid {
      primaryFunction
    }
  }
`

// @graphql-typegen auto-generated
type CharacterFields =
  | {
      name: string,
      appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
      __typename: 'Human',
      mass: ?number,
    }
  | {
      name: string,
      appearsIn: Array<?('NEWHOPE' | 'EMPIRE' | 'JEDI')>,
      __typename: 'Droid',
      primaryFunction: ?string,
    }

const fragment2 = gql`
  ${fragment}
  fragment CharacterAndFriends on Character {
    ...CharacterFields
    friends {
      ...CharacterFields
    }
  }
`

// @graphql-typegen auto-generated
type CharacterAndFriends = {
  __typename: 'Human' | 'Droid',
  friends: ?Array<?CharacterFields>,
} & CharacterFields

const query = gql`
  ${fragment2}
  query Test($id: ID!) {
    character(id: $id) {
      id
      ...CharacterAndFriends
    }
  }
`

// @graphql-typegen auto-generated
type TestQueryVariables = { id: string }

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  character: ?({
    __typename: 'Human' | 'Droid',
    id: string,
  } & CharacterAndFriends),
}
```

# Rationale

With established GraphQL code generators out there (`apollo-tooling` and `graphql-codegen`)
you might wonder why I decided to make my own instead. There are several reasons...

## Importing generated types from external files is annoying

Both `graphql-codegen` and `apollo-tooling` output types in separate files from your
GraphQL documents. This means you have to pick a globally unique identifier for
each GraphQL operation. Dealing with global namespaces is always a pain in the ass.
It also means you have to insert an import statement. While I also have [my own tool
that's pretty damn good at automatic imports](https://github.com/jedwards1211/dude-wheres-my-module),
it would still be an annoying extra step.

`graphql-typegen` just inserts the generated types after the GraphQL
tagged template literals in my code, so I don't have to worry about picking
globally unique operation names or adding imports.

## `graphql-codegen` outputs messy types for documents

Example:

```graphql
query Test($id: ID!) {
  user(id: $id) {
    id
    username
  }
}
```

Output:

```js
type $Pick<Origin: Object, Keys: Object> = $ObjMapi<
  Keys,
  <Key>(k: Key) => $ElementType<Origin, Key>
>

export type TestQueryVariables = {
  id: $ElementType<Scalars, 'ID'>,
}

export type TestQuery = {
  ...{ __typename?: 'Query' },
  ...{|
    user: ?{
      ...{ __typename?: 'User' },
      ...$Pick<User, {| id: *, username: * |}>,
    },
  |},
}
```

Pretty awful, huh? It's questionable if this even works properly in Flow; I've seen bugs with spreads inside inexact/ambiguous object types in the past.

`graphql-typegen` would output:

```js
// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: ID,
    username: string,
  },
}
```

## I want to extract parts of the query with their own type aliases

Take the query example above. Let's say I need to refer to the `user` type in `TestQuery`
above. All I have to do is add this comment:

```graphql
query Test($id: ID!) {
  # @graphql-typegen extract
  user(id: $id) {
    id
    username
  }
}
```

And `graphql-typegen` will output:

```js
// @graphql-typegen auto-generated
type User = {
  __typename: 'User',
  id: ID,
  username: string,
}

// @graphql-typegen auto-generated
type TestQueryData = {
  __typename: 'Query',
  user: User,
}
```

This is much easier than `type User = $PropertyType<TestQuery, 'user'>`,
especially for extracting types that are more than one level deep in the query
(`$PropertyType<$PropertyType<TestQuery, 'foo'>, 'bar'>` would be pretty awful)

## Interpolation in GraphQL tagged template literals

At the moment, [`apollo-tooling` doesn't support interpolation in tagged template literals](https://github.com/apollographql/apollo-tooling/issues/182).
This is a pretty crucial for sharing fragments between queries and mutations, which is, you know, common.

`graphql-typegen` supports this:

```js
const UserFragment = gql`
  fragment UserFields on User {
    id
    username
  }
`

const userQuery = gql`
  ${UserFragment}
  query user($id: ID!) {
    user(id: $id) {
      ...UserFields
    }
  }
`

const updateUserMutation = gql`
  ${UserFragment}
  mutation updateUser($id: ID!, $values: UpdateUser!) {
    updateUser(id: $id, values: $values) {
      ...UserFields
    }
  }
`
```

Output:

```js
// @graphql-typegen auto-generated
type UserFields = {
  id: ID,
  username: string,
}

// @graphql-typegen auto-generated
type UserQueryData = {
  __typename: 'Query',
  user: { __typename: 'User' } & UserFields,
}

// @graphql-typegen auto-generated
type UserQueryVariables = {
  id: ID,
}

// @graphql-typegen auto-generated
type UpdateUserMutationData = {
  __typename: 'Mutation',
  updateUser: { __typename: 'User' } & UserFields,
}

// @graphql-typegen auto-generated
type UpdateUserMutationVariables = {
  id: ID,
  values: {
    username?: string,
  },
}
```

`graphql-typegen` also supports string interpolation:

```js
const userFields = `
  id
  username
`

const userQuery = gql`
  query user($id: ID!) {
    user(id: $id) {
      ${userFields}
    }
  }
`

const updateUserMutation = gql`
  mutation updateUser($id: ID!, $values: UpdateUser!) {
    updateUser(id: $id, values: $values) {
      ${userFields}
    }
  }
`
```

Output:

```js
// @graphql-typegen auto-generated
type UserQueryData = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: ID,
    username: string,
  },
}

// @graphql-typegen auto-generated
type UserQueryVariables = {
  id: ID,
}

// @graphql-typegen auto-generated
type UpdateUserMutationData = {
  __typename: 'Mutation',
  updateUser: {
    __typename: 'User',
    id: ID,
    username: string,
  },
}

// @graphql-typegen auto-generated
type UpdateUserMutationVariables = {
  id: ID,
  values: {
    username?: string,
  },
}
```

## Automatically adding type annotations to `Query`, `Mutation`, `useQuery`, `useMutation`, and `useSubscription`

`graphql-typegen` will analyze all calls to these hooks and add the correct type annotations:

### Before

```js
const userQuery = gql`
  query user($id: ID!) {
    user(id: $id) {
      id
      username
    }
  }
`

const Foo = ({ id }: { id: ID }): React.Node => {
  const { data } = useQuery(userQuery, { variables: { id } })
  return <pre>{JSON.stringify(data)}</pre>
}
```

### After

`graphql-typegen` inserts the type parameters `useQuery<UserQueryData, UserQueryVariables>`.

```js
const userQuery = gql`
  query user($id: ID!) {
    user(id: $id) {
      id
      username
    }
  }
`

// @graphql-typegen auto-generated
type UserQueryData = {
  __typename: 'Query',
  user: {
    __typename: 'User',
    id: ID,
    username: string,
  },
}

// @graphql-typegen auto-generated
type UserQueryVariables = {
  id: ID,
}

const Foo = ({id}: {id: ID}): React.Node => {
  const {data} = useQuery<UserQueryData, UserQueryVariables>(userQuery, {variables: {id}})
  return <pre>{JSON.stringify(data)}</pre>
}
```

# Configuration

## `schemaFile` / `server`

First, you need to add the following to your `package.json` to tell `graphql-typegen` how to
find your schema:

```
  "graphql-typegen": {
    "schemaFile": "path/to/schema.graphql"
  }
```

Or

```
  "graphql-typegen": {
    "server": "http://localhost:4000/graphql"
  }
```

## `tagName` (default: `gql`)

Name of the template literal tag used to identify template literals containing GraphQL queries in Javascript/Typescript code

Configure this in your `package.json`:

```
  "graphql-typegen": {
    "tagName": "gql"
  }
```

## `validate` (default: `true`)

Whether to validate each GraphQL document before processing it.
Excludes `NoUnusedFragmentsRule` from validation, in case you put fragment definitions
in separate template literals.

Right now this is only configurable in your `package.json`:

```
  "graphql-typegen": {
    "validate": false
  }
```

## `addTypename` (default: `true`)

Places this may be configured, in order of increasing precendence:

### `package.json`

```
  "graphql-typegen": {
    "addTypename": false
  }
```

### in the description for a type or field in your GraphQL schema

```graphql
"""
@graphql-typegen noTypename
"""
type User {
  id: ID!
  name: String!
}
```

### in a comment in your GraphQL document

```js
const query = gql`
  query user($id: Int!) {
    # @graphql-typegen addTypename
    user(id: $id) {
      id
      name
    }
  }
`
```

## `objectType` (default: `ambiguous`)

The type of Flow object to output, one of:

- `exact`
- `inexact`
- `ambiguous`

Places this may be configured, in order of increasing precendence:

### `package.json`

```
  "graphql-typegen": {
    "objectType": "exact"
  }
```

### in the description for a type or field in your GraphQL schema

```graphql
"""
@graphql-typegen exact
"""
type User {
  id: ID!
  name: String!
}
```

### in a comment in your GraphQL document

```js
const query = gql`
  query user($id: Int!) {
    # @graphql-typegen exact
    user(id: $id) {
      id
      name
    }
  }
`
```

## `useReadOnlyTypes` (default: `false`)

Whether to use readonly object and array types.

Places this may be configured, in order of increasing precendence:

### `package.json`

```
  "graphql-typegen": {
    "useReadOnlyTypes": true
  }
```

### in the description for a type or field in your GraphQL schema

```graphql
"""
@graphql-typegen readOnly
"""
type User {
  id: ID!
  name: String!
}
```

### in a comment in your GraphQL document

```js
const query = gql`
  query user($id: Int!) {
    # @graphql-typegen mutable
    user(id: $id) {
      id
      name
    }
  }
`
```

## `useFunctionTypeArguments` (default: `true`)

Whether to annotate `useQuery`, `useMutation` and `useSubscription` calls with type arguments,
or annotate the input variables and output data.

Configure this in your `package.json`:

```
  "graphql-typegen": {
    "useFunctionTypeArguments": false
  }
```

### When `true` (default)

Adds `<QueryData, QueryVariables>` to `useQuery`:

```js
const {loading, error, data} = useQuery<QueryData, QueryVariables>(query, {
  variables: {id}
})
```

### When `false`:

Annotates this way:

```js
const {
  loading,
  error,
  data,
}: QueryRenderProps<QueryData, QueryVariables> = useQuery(query, {
  variables: ({ id }: QueryVariables),
})
```

## `external as <type annotation or import statement>`

Makes `graphql-typegen` use the given external type for a scalar.

Places this may be configured, in order of increasing precendence:

### in the description for a type or field in your GraphQL schema

```graphql
"""
@graphql-typegen external as import { type DateISOString } from './src/types/DateISOString'
"""
scalar DateTime
```

### in a comment in your GraphQL document

```js
const query = gql`
  query user($id: Int!) {
    user(id: $id) {
      id
      # @graphql-typegen external as string
      createdAt
    }
  }
`
```

## `extract [as <identifier>]`

Makes `graphql-typegen` extract the given type or field's inner type into a type alias,
instead of generating an inline type.

There may be funky behavior if a selection set with inline fragment spreads is extracted.

The name of the type is used if you don't specify **as <identifier>**.

Places this may be configured, in order of increasing precendence:

### in the description for a type or field in your GraphQL schema

```graphql
"""
@graphql-typegen extract
"""
type User {

}
```

### in a comment in your GraphQL document

```js
const query = gql`
  query user($id: Int!) {
    # @graphql-typegen extract as User
    user(id: $id) {
      id
      name
    }
  }
`
```

#### Output without `extract`

```js
// @graphql-typegen auto-generated
type UserQueryData = {
  __typename: 'Query',
  user: ?{
    id: string,
    name: string,
  },
}
```

#### Output with `extract as User`

```js
// @graphql-typegen auto-generated
type UserQueryData = {
  __typename: 'Query',
  user: ?User,
}

// @graphql-typegen auto-generated
type User = {
  id: string,
  name: string,
}
```

# CLI Usage

```
jscodeshift -t path/to/graphql-typegen/graphql-typegen.js src/**/*.js
```

# Node.js API

Because `jscodeshift` unfortunately requires transform functions to be sync,
`graphql-typegen` uses an `execFileSync` hack to synchronously fetch your schema
from your schema file or server.

If you're calling directly from node, you can bypass this by using `graphql-typegen-async`:

```js
import graphqlTypegen from 'graphql-typegen/graphql-typegen-async'
```

It has the same API as a `jscodeshift` transform, except that it returns a `Promise` instead
of a sync result. Maybe someday `jscodeshift` will support async transforms.
