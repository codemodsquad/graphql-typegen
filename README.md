# graphql-typegen

[![CircleCI](https://circleci.com/gh/codemodsquad/graphql-typegen.svg?style=svg)](https://circleci.com/gh/codemodsquad/graphql-typegen)
[![Coverage Status](https://codecov.io/gh/codemodsquad/graphql-typegen/branch/master/graph/badge.svg)](https://codecov.io/gh/codemodsquad/graphql-typegen)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/graphql-typegen.svg)](https://badge.fury.io/js/graphql-typegen)

**Work in progress**

JSCodeshift transform that inserts Flow types generated from GraphQL documents in template string literals and your GraphQL schema

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

## Automatically adding type annotations to `useQuery`, `useMutation`, and `useSubscription` hooks

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
