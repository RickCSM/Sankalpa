import fsPromises from "node:fs/promises";

// ---------------------------------------------------------------------------
// LocalFileRef — shared type used by both objectAcl and objectStorage.
// Defined here (not in objectStorage.ts) to avoid circular imports.
// ---------------------------------------------------------------------------
export interface LocalFileRef {
  filePath: string;
}

// Can be flexibly defined according to the use case.
//
// Examples:
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content creator.
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a user-list DB id, an email domain, a group id.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// Stored as a JSON sidecar file alongside the object: <filePath>.acl.json
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    // Implement per access group type, e.g.:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// ---------------------------------------------------------------------------
// setObjectAclPolicy
//
// Writes the ACL policy as a JSON sidecar file: <filePath>.acl.json
// ---------------------------------------------------------------------------
export async function setObjectAclPolicy(
  ref: LocalFileRef,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  await fsPromises.writeFile(
    ref.filePath + ".acl.json",
    JSON.stringify(aclPolicy),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// getObjectAclPolicy
//
// Reads the JSON sidecar file. Returns null if not found.
// ---------------------------------------------------------------------------
export async function getObjectAclPolicy(
  ref: LocalFileRef,
): Promise<ObjectAclPolicy | null> {
  try {
    const raw = await fsPromises.readFile(ref.filePath + ".acl.json", "utf-8");
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// evaluateObjectAccess — pure access decision given an already-loaded policy.
//
// Backend-agnostic: the local driver reads the policy from a sidecar file, the
// S3 / Replit drivers read it from a companion object, and all of them funnel
// the result through this single evaluator so the access rules stay identical
// regardless of where the file physically lives.
// ---------------------------------------------------------------------------
export async function evaluateObjectAccess(
  aclPolicy: ObjectAclPolicy | null,
  {
    userId,
    requestedPermission,
  }: {
    userId?: string;
    requestedPermission: ObjectPermission;
  },
): Promise<boolean> {
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// canAccessObject — local-disk convenience wrapper: load the sidecar policy
// then evaluate. Kept for the local driver; other backends call
// evaluateObjectAccess directly with a policy they fetched themselves.
// ---------------------------------------------------------------------------
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: LocalFileRef;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  return evaluateObjectAccess(await getObjectAclPolicy(objectFile), {
    userId,
    requestedPermission,
  });
}
