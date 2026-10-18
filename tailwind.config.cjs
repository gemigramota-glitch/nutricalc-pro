module.exports = {
            darkMode: 'class',
            safelist: ['text-amber-400','sr-only','hidden','print:block', ...['indigo','emerald','rose','sky','amber','yellow','slate','purple','teal'].flatMap(c=>['border-l-'+c+'-500','text-'+c+'-400','border-t-'+c+'-400'])],
            content: ['./index.html','./app.js'],
            theme: {
                extend: {
                    colors: {
                        emerald: {
                            400: '#34d399',
                            500: '#10b981',
                            600: '#059669',
                            700: '#047857',
                        },
                        dark: {
                            bg: '#0f172a',
                            card: '#1e293b',
                            border: '#334155',
                            hover: '#334155/60'
                        }
                    },
                    boxShadow: {
                        'neon': '0 0 20px rgba(16, 185, 129, 0.25)',
                        'neon-lg': '0 0 35px rgba(16, 185, 129, 0.4)',
                        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
                    }
                }
            }
        };
