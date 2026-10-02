# Services

Application business logic belongs here. Auth routes call AuthService, which coordinates password
and token modules with UserRepository and AuthSessionRepository. Only repositories/database
infrastructure perform Prisma queries. AuthService recognizes Prisma constraint error types to
map concurrent registration conflicts. Registration uses one atomic nested repository write.
Realtime gameplay remains independent of authentication and persistence.
