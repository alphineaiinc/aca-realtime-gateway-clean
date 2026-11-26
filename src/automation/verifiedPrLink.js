"use strict";

/**
 * GitHub GraphQL closing-issue references are platform-resolved associations,
 * not a review, authorization, or proof of the author's intent.
 * Ambiguity, pagination, foreign repositories and missing metadata fail closed.
 */
function verifyClosingIssueLink({prNumber, issueNumber, repositoryId, data} = {}) {
  const node = data?.repository?.pullRequest;
  const edges = node?.closingIssuesReferences;
  if (!Number.isSafeInteger(prNumber) || prNumber < 1 ||
      !Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
      typeof repositoryId !== "string" || !repositoryId ||
      node?.number !== prNumber || edges?.pageInfo?.hasNextPage !== false ||
      !Array.isArray(edges?.nodes) || edges.nodes.length !== 1) return false;
  const issue = edges.nodes[0];
  return issue?.number === issueNumber && issue?.repository?.databaseId != null &&
    String(issue.repository.databaseId) === repositoryId;
}
module.exports = {verifyClosingIssueLink};
