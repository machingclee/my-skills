package {{basePackage}}.ftp;

import org.apache.ftpserver.ftplet.Authentication;
import org.apache.ftpserver.ftplet.AuthenticationFailedException;
import org.apache.ftpserver.ftplet.FtpException;
import org.apache.ftpserver.ftplet.User;
import org.apache.ftpserver.ftplet.UserManager;
import org.apache.ftpserver.usermanager.UsernamePasswordAuthentication;

import java.util.Objects;

class StaticUserManager implements UserManager {

    private final User user;

    StaticUserManager(User user) {
        this.user = user;
    }

    @Override
    public User getUserByName(String username) {
        return doesExist(username) ? user : null;
    }

    @Override
    public String[] getAllUserNames() {
        return new String[]{user.getName()};
    }

    @Override
    public void delete(String username) {
    }

    @Override
    public void save(User user) {
    }

    @Override
    public boolean doesExist(String username) {
        return Objects.equals(user.getName(), username);
    }

    @Override
    public User authenticate(Authentication authentication) throws AuthenticationFailedException {
        if (!(authentication instanceof UsernamePasswordAuthentication credentials)
                || !doesExist(credentials.getUsername())
                || !Objects.equals(user.getPassword(), credentials.getPassword())) {
            throw new AuthenticationFailedException("Authentication failed");
        }
        return user;
    }

    @Override
    public String getAdminName() throws FtpException {
        return "admin";
    }

    @Override
    public boolean isAdmin(String username) {
        return false;
    }
}
