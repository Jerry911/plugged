# syntax=docker/dockerfile:1

# ---- Build: Maven builds the React frontend (frontend-maven-plugin) and the Spring Boot jar ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY frontend frontend
COPY backend backend
# Set --build-arg RUN_TESTS=true to run the backend and frontend tests during the image build.
ARG RUN_TESTS=false
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -f backend/pom.xml clean package -DskipTests=$([ "$RUN_TESTS" = "true" ] && echo false || echo true)

# ---- Runtime ----
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --create-home plugged \
    && mkdir /data && chown plugged:plugged /data
WORKDIR /app
COPY --from=build /build/backend/target/plugged-*.jar /app/app.jar
ENV SPRING_DATASOURCE_URL=jdbc:h2:file:/data/plugged \
    PORT=8080 \
    JAVA_OPTS=""
USER plugged
VOLUME /data
# the app listens on $PORT (default 8080); publish it with -p <host>:<PORT>
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
