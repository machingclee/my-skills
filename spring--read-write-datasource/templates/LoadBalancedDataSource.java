package com.example.config.datasource;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Logger;

/**
 * Round-robin DataSource over a list of target pools. Only needed when a side
 * (usually read) lists more than one URL. Connection-acquiring calls rotate;
 * every other DataSource method reads from the first pool.
 */
public class LoadBalancedDataSource implements DataSource {

    private final List<DataSource> targets;
    private final AtomicInteger counter = new AtomicInteger(0);

    public LoadBalancedDataSource(List<DataSource> targets) {
        if (targets == null || targets.isEmpty()) {
            throw new IllegalArgumentException("At least one target DataSource is required");
        }
        this.targets = List.copyOf(targets);
    }

    private DataSource pick() {
        int index = Math.abs(counter.getAndIncrement() % targets.size());
        return targets.get(index);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return pick().getConnection();
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return pick().getConnection(username, password);
    }

    @Override
    public PrintWriter getLogWriter() throws SQLException {
        return targets.get(0).getLogWriter();
    }

    @Override
    public void setLogWriter(PrintWriter out) throws SQLException {
        for (DataSource ds : targets) {
            ds.setLogWriter(out);
        }
    }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException {
        for (DataSource ds : targets) {
            ds.setLoginTimeout(seconds);
        }
    }

    @Override
    public int getLoginTimeout() throws SQLException {
        return targets.get(0).getLoginTimeout();
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return targets.get(0).getParentLogger();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        return targets.get(0).unwrap(iface);
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) throws SQLException {
        return targets.get(0).isWrapperFor(iface);
    }
}
