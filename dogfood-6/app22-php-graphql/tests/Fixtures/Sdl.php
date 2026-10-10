<?php
declare(strict_types=1);

namespace GraphqlLite\Tests\Fixtures;

final class Sdl
{
    public const APP = <<<'SDL'
type Query {
  user(id: ID!): User
  users(limit: Int = 10, tags: [String!]): [User!]!
  node(id: ID!): Node
  search(text: String!): [SearchResult]
  me: User
  echo(i: Int, f: Float, s: String, b: Boolean, l: [Int], o: In, e: Role): String
  nn(x: Int!): Int
  matrix: [[Int!]!]
  must: Int!
}
interface Node { id: ID! }
type User implements Node { id: ID! name: String age: Int friends(first: Int = 5): [User!] posts: [Post!]! role: Role active: Boolean score: Float }
type Post implements Node { id: ID! title: String author: User! }
union SearchResult = User | Post
enum Role { ADMIN MEMBER }
input In { a: Int! b: [Int!] c: In2 }
input In2 { x: Int }
type Mutation { createUser(name: String!, role: Role = MEMBER): User bump: Int }
SDL;
}
