# PocketBase service for Railway.
# Mount a volume at /pb_data. Setting PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD on
# the service auto-creates the superuser (the API's initPocketBase() then
# creates all collections and authenticates with those credentials).
FROM ghcr.io/muchobien/pocketbase:latest
EXPOSE 8090
VOLUME /pb_data
