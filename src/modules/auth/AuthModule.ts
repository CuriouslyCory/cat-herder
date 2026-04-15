import type { User } from "@workos-inc/authkit-react";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

/**
 * Thin wrapper around the WorkOS authkit-react hook values.
 * Constructed by App.tsx after it obtains the hook result and passed to Game.
 */
export class AuthModule {
  constructor(
    private readonly _signIn: () => void,
    private readonly _signOut: () => void,
    private readonly _getUser: () => User | null,
    private readonly _getToken: () => Promise<string>,
  ) {}

  signIn(): void {
    this._signIn();
  }

  signOut(): void {
    this._signOut();
  }

  getUser(): AuthUser | null {
    const user = this._getUser();
    return user ? toAuthUser(user) : null;
  }

  async getToken(): Promise<string> {
    return this._getToken();
  }
}
