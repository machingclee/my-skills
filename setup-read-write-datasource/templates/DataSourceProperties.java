package com.example.config.datasource;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Binds the app.datasource.write.* and app.datasource.read.* property groups.
 * Each side accepts a list of URLs so a single replica can grow into several.
 */
@ConfigurationProperties("app.datasource")
public class DataSourceProperties {

    private final Pool write = new Pool();
    private final Pool read = new Pool();

    public Pool getWrite() { return write; }
    public Pool getRead()  { return read; }

    public static class Pool {
        private List<String> urls = new ArrayList<>();
        private String driverClassName = "com.mysql.cj.jdbc.Driver";
        private String username;
        private String password;
        private int maximumPoolSize = 5;
        private int minimumIdle = 2;
        private long connectionTimeout = 30000;
        private long idleTimeout = 600000;

        public List<String> getUrls()              { return urls; }
        public void setUrls(List<String> urls)     { this.urls = urls; }
        public String getDriverClassName()         { return driverClassName; }
        public void setDriverClassName(String d)   { this.driverClassName = d; }
        public String getUsername()                { return username; }
        public void setUsername(String u)          { this.username = u; }
        public String getPassword()                { return password; }
        public void setPassword(String p)          { this.password = p; }
        public int getMaximumPoolSize()            { return maximumPoolSize; }
        public void setMaximumPoolSize(int s)      { this.maximumPoolSize = s; }
        public int getMinimumIdle()                { return minimumIdle; }
        public void setMinimumIdle(int i)          { this.minimumIdle = i; }
        public long getConnectionTimeout()         { return connectionTimeout; }
        public void setConnectionTimeout(long t)   { this.connectionTimeout = t; }
        public long getIdleTimeout()               { return idleTimeout; }
        public void setIdleTimeout(long t)         { this.idleTimeout = t; }
    }
}
