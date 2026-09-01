package {{basePackage}}.common.aws.ses;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.ses.SesClient;
import software.amazon.awssdk.services.ses.model.Body;
import software.amazon.awssdk.services.ses.model.Content;
import software.amazon.awssdk.services.ses.model.Destination;
import software.amazon.awssdk.services.ses.model.Message;
import software.amazon.awssdk.services.ses.model.SendEmailRequest;
import software.amazon.awssdk.services.ses.model.SendEmailResponse;
import software.amazon.awssdk.services.ses.model.SesException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Thin wrapper around Amazon SES for transactional outbound mail.
 * <p>
 * Requires a verified SES identity for {@code app.ses.from-address}
 * (email identity or domain identity). While the account is in the SES
 * sandbox, every To/CC/BCC recipient must also be verified.
 * <p>
 * Optional {@code app.ses.cc-addresses} (comma-separated) are always CC'd
 * on every send, minus the To recipient and any {@code ccExclusions}.
 * <p>
 * If the project already maps a {@code BadRequestException} (or similar) to
 * HTTP 400, replace the three {@code IllegalArgumentException} throws with that type.
 */
@Service
@RequiredArgsConstructor
public class AwsSesService {

    private static final Logger log = LoggerFactory.getLogger(AwsSesService.class);
    private static final String CHARSET = "UTF-8";

    private final SesClient sesClient;

    @Value("${app.ses.from-address}")
    private String fromAddress;

    /**
     * Comma-separated addresses always CC'd on every send.
     */
    @Value("${app.ses.cc-addresses:}")
    private String ccAddresses;

    /**
     * Send a plain-text email from the configured From identity.
     *
     * @return SES message id
     */
    public String sendText(String to, String subject, String textBody) {
        return send(to, subject, textBody, null, null, null);
    }

    /**
     * Send email with plain text and optional HTML body.
     * Always CC's {@code app.ses.cc-addresses} when configured.
     *
     * @return SES message id
     */
    public String send(String to, String subject, String textBody, String htmlBody) {
        return send(to, subject, textBody, htmlBody, null, null);
    }

    /**
     * Send email with plain text + optional HTML, BCC recipients,
     * and a set of addresses to exclude from the configured CC list
     * (recipients who already receive the email as To/BCC).
     *
     * @param to           primary recipient
     * @param bccAddresses additional blind-carbon-copy recipients (nullable)
     * @param ccExclusions addresses to omit from the configured CC list,
     *                     compared case-insensitively (nullable)
     * @return SES message id
     */
    public String send(String to, String subject, String textBody, String htmlBody,
                       List<String> bccAddresses, Set<String> ccExclusions) {
        if (to == null || to.isBlank()) {
            throw new IllegalArgumentException("email recipient is required");
        }
        if (subject == null || subject.isBlank()) {
            throw new IllegalArgumentException("email subject is required");
        }
        if ((textBody == null || textBody.isBlank()) && (htmlBody == null || htmlBody.isBlank())) {
            throw new IllegalArgumentException("email body is required");
        }

        String recipient = to.trim();
        List<String> cc = resolveCc(recipient, ccExclusions);

        Body.Builder bodyBuilder = Body.builder();
        if (textBody != null && !textBody.isBlank()) {
            bodyBuilder.text(Content.builder().data(textBody).charset(CHARSET).build());
        }
        if (htmlBody != null && !htmlBody.isBlank()) {
            bodyBuilder.html(Content.builder().data(htmlBody).charset(CHARSET).build());
        }

        Destination.Builder destination = Destination.builder().toAddresses(recipient);
        if (!cc.isEmpty()) {
            destination.ccAddresses(cc);
        }
        if (bccAddresses != null && !bccAddresses.isEmpty()) {
            destination.bccAddresses(bccAddresses);
        }

        SendEmailRequest.Builder request = SendEmailRequest.builder()
                .source(fromAddress)
                .destination(destination.build())
                .message(Message.builder()
                        .subject(Content.builder().data(subject).charset(CHARSET).build())
                        .body(bodyBuilder.build())
                        .build());

        try {
            SendEmailResponse response = sesClient.sendEmail(request.build());
            log.info("SES email sent messageId={} to={} cc={} bcc={} subject={}",
                    response.messageId(), recipient, cc,
                    bccAddresses != null ? bccAddresses.size() : 0, subject);
            return response.messageId();
        } catch (SesException e) {
            log.error("SES send failed to={} cc={} statusCode={} awsError={}",
                    recipient,
                    cc,
                    e.statusCode(),
                    e.awsErrorDetails() != null ? e.awsErrorDetails().errorMessage() : e.getMessage());
            throw e;
        }
    }

    /**
     * Parse configured CCs; skip blanks, the To recipient, and any exclusions
     * (e.g. recipients already receiving the mail as To/BCC).
     */
    private List<String> resolveCc(String to, Set<String> exclusions) {
        if (ccAddresses == null || ccAddresses.isBlank()) {
            return List.of();
        }
        String toLower = to.toLowerCase(Locale.ROOT);
        return Arrays.stream(ccAddresses.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .filter(s -> !s.toLowerCase(Locale.ROOT).equals(toLower))
                .filter(s -> exclusions == null || !exclusions.contains(s.toLowerCase(Locale.ROOT)))
                .collect(Collectors.toCollection(ArrayList::new));
    }
}
