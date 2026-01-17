module.exports = [
    {
        files: ['**/*.js'],
        ignores: ['node_modules/**', 'build/**', 'dist/**'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                exports: 'readonly',
                global: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-var': 'error',
            'prefer-const': 'warn'
        }
    },
    {
        files: ['**/*.{ts,tsx}'],
        ignores: ['node_modules/**', 'build/**', 'dist/**', '*.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: require('@typescript-eslint/parser'),
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                project: './tsconfig.json'
            },
            globals: {
                console: 'readonly',
                fetch: 'readonly',
                require: 'readonly',
                module: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                __DEV__: 'readonly',
                global: 'readonly',
                NodeJS: 'readonly',
                jest: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                ErrorUtils: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
            'react': require('eslint-plugin-react'),
            'react-native': require('eslint-plugin-react-native')
        },
        settings: {
            react: {
                version: 'detect'
            }
        },
        rules: {
            // TypeScript specific rules
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',

            // React rules
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/jsx-uses-react': 'off',

            // React Native rules
            'react-native/no-unused-styles': 'warn',
            'react-native/split-platform-components': 'warn',
            'react-native/no-inline-styles': 'warn',
            'react-native/no-color-literals': 'warn',

            // General rules
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'off', // typescript rule will handle this
            'no-undef': 'error',
            'no-var': 'error',
            'prefer-const': 'warn'
        }
    }
];
