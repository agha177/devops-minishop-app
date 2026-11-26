pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        AWS_DEFAULT_REGION = 'us-east-1'
        ECR_REGISTRY = '861097501014.dkr.ecr.us-east-1.amazonaws.com'
        BACKEND_REPO = 'minishop-backend'
        FRONTEND_REPO = 'minishop-frontend'

        GITOPS_REPO = 'https://github.com/agha177/devops-minishop-gitops.git'
        GITOPS_BRANCH = 'main'
        GITOPS_OVERLAY = 'k8s/overlays/dev'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm

                script {
                    env.IMAGE_TAG = sh(
                        script: 'git rev-parse --short=7 HEAD',
                        returnStdout: true
                    ).trim()
                }

                echo "Building commit: ${env.IMAGE_TAG}"
            }
        }

        stage('Validate Backend') {
            steps {
                sh '''
                    docker run --rm \
                      -v "$WORKSPACE/backend:/app:ro" \
                      -w /app \
                      node:22-alpine \
                      sh -c 'node --check src/app.js && node --check src/db.js'
                '''
            }
        }

        stage('Validate Frontend') {
            steps {
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" \
                      -e HOME=/tmp \
                      -e npm_config_cache=/tmp/.npm \
                      -v "$WORKSPACE/frontend:/app" \
                      -w /app \
                      node:22-alpine \
                      sh -c 'npm ci && npm run lint && npm run build'
                '''
            }
        }

        stage('Build Backend Image') {
            steps {
                sh '''
                    docker build \
                      -t "$ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG" \
                      ./backend
                '''
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh '''
                    docker build \
                      -t "$ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG" \
                      ./frontend
                '''
            }
        }

        stage('Push Images to ECR') {
            steps {
                withCredentials([
                    string(
                        credentialsId: 'aws-access-key-id',
                        variable: 'AWS_ACCESS_KEY_ID'
                    ),
                    string(
                        credentialsId: 'aws-secret-access-key',
                        variable: 'AWS_SECRET_ACCESS_KEY'
                    )
                ]) {
                    sh '''#!/bin/bash
set -euo pipefail
set +x

export DOCKER_CONFIG="$(mktemp -d)"
trap 'docker logout "$ECR_REGISTRY" >/dev/null 2>&1 || true; rm -rf "$DOCKER_CONFIG"' EXIT

aws ecr get-login-password \
  --region "$AWS_DEFAULT_REGION" |
docker login \
  --username AWS \
  --password-stdin \
  "$ECR_REGISTRY"

docker push "$ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG"
docker push "$ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG"
'''
                }
            }
        }

        stage('Update GitOps Repository') {
            steps {
                dir('gitops-workspace') {
                    deleteDir()

                    withCredentials([
                        gitUsernamePassword(
                            credentialsId: 'github-gitops-credentials',
                            gitToolName: 'Default'
                        )
                    ]) {
                        sh '''#!/bin/bash
set -euo pipefail
set +x

export GIT_TERMINAL_PROMPT=0

git clone \
  --branch "$GITOPS_BRANCH" \
  --single-branch \
  "$GITOPS_REPO" .

git config user.name "MiniShop Jenkins CI"
git config user.email "jenkins@minishop.local"

cd "$GITOPS_OVERLAY"

kustomize edit set image \
  "$BACKEND_REPO=$ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG" \
  "$FRONTEND_REPO=$ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG"

RENDERED=$(mktemp)
trap 'rm -f "$RENDERED"' EXIT

kustomize build . > "$RENDERED"

grep -F "image: $ECR_REGISTRY/$BACKEND_REPO:$IMAGE_TAG" "$RENDERED"
grep -F "image: $ECR_REGISTRY/$FRONTEND_REPO:$IMAGE_TAG" "$RENDERED"

git diff -- kustomization.yaml

git add kustomization.yaml

if git diff --cached --quiet; then
    echo "No GitOps changes required"
else
    git commit -m "Deploy MiniShop dev images: $IMAGE_TAG"
    git push origin "$GITOPS_BRANCH"

    echo "GitOps repository updated successfully"
fi
'''
                    }
                }
            }
        }
    }

    post {
        success {
            echo "MiniShop images published and GitOps configuration ready for tag ${env.IMAGE_TAG}"
        }

        failure {
            echo 'MiniShop pipeline failed. Inspect the failed stage.'
        }
    }
}

