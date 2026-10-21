import { GraphQLError } from "graphql";
import { db } from "../builder";
import bcrypt from "bcrypt";
import { users } from "../../db";
import { eq } from "drizzle-orm";

export const getUser = async (id: number) => {
  const user = await db.query.users.findFirst({ where: { id: id } });

  if (!user) {
    throw new GraphQLError("User not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return user;
};

export const getUserByEmail = async (email: string) => {
  const user = await db.query.users.findFirst({ where: { email: email } });

  if (!user) {
    throw new GraphQLError("User not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return user;
};

export const createUser = async (
  email: string,
  name: string,
  password: string,
) => {
  const userCheck = await db.query.users.findFirst({ where: { email: email } });

  if (userCheck) {
    throw new GraphQLError("Someone with this email already exists", {
      extensions: {
        code: "BAD_USER_INPUT",
      },
    });
  }

  const saltRounds = 14;
  const salt = bcrypt.genSaltSync(saltRounds);
  const hash = bcrypt.hashSync(password, salt);

  const user = await db
    .insert(users)
    .values({ email: email, name: name, hashedPassword: hash })
    .returning();

  if (!user[0]) {
    throw new GraphQLError(
      "Something went wrong when creating user. Please try again.",
      {
        extensions: {
          code: "BAD_USER_INPUT",
        },
      },
    );
  }

  return user[0];
};

export const updateUser = async (
  id: number,
  email?: string,
  name?: string,
  password?: string,
) => {
  const user = await db.query.users.findFirst({ where: { id: id } });

  if (!user) {
    throw new GraphQLError("User not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const userDto = {
    name: name ?? user.name,
    email: email ?? user.email,
    hashedPassword: password ? encryptPass(password) : user.hashedPassword,
  };

  const updatedUser = await db
    .update(users)
    .set(userDto)
    .where(eq(users.id, id))
    .returning();

  return updatedUser[0];
};

const encryptPass = (password: string) => {
  const saltRounds = 14;
  const salt = bcrypt.genSaltSync(saltRounds);
  const hash = bcrypt.hashSync(password, salt);

  return hash;
};
